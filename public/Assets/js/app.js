let AppProcess = (() => {
    let serverProcess,
    peersConnectionIds = [],
    peersConnection = [],
    remote_vid_stream = [],
    remote_aud_stream = [],
    localVideoPlayer,
    audio,
    isAudioMute = true,
    rtp_aud_senders = [],
    rtp_vid_senders = [],
    video_states = {
        None: 0,
        Camera: 1,
        ScreenShare: 2
    },
    video_st = video_states.None,
    videoCamTrack

    let iceConfiguration = {
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302"
            },
            {
                urls: "stun:stun1.l.google.com:19302"
            }
        ],
    }

    const _init = async (SDP_fn, myConnId) => {
        serverProcess = SDP_fn
        myConnectionId = myConnId

        eventProcess()
        localVideo = document.getElementById("localVideoPlayer")
    }

    const connection_status = (connection) => {
        if(
            connection && 
            (
                connection.connectionState === "new" || 
                connection.connectionState === "connecting" ||
                connection.connectionState === "connected"
            )
        ){
            return true
        }

        return false
    }

    const updateMediaSenders = async (track, rtp_senders) => {
        for(let con_id in peersConnectionIds){
            if(connection_status(peersConnection[con_id])){
                if(rtp_senders[con_id] && rtp_senders[con_id].track){
                    rtp_senders[con_id].replaceTrack(track)
                } else {
                    rtp_senders[con_id] = peersConnection[con_id].addTrack(track)
                }
            }
        }
    }

    const removeMediaSenders = (rtp_senders) => {
        for(let con_id in peersConnectionIds){
            if(rtp_senders[con_id] && connection_status(peersConnection[con_id])){
                peersConnection[con_id].removeTrack(rtp_senders[con_id])
                rtp_senders[con_id] = null
            }
        }
    }

    const removeVideoStream = (rtp_vid_senders) => {
        if(videoCamTrack){
            videoCamTrack.stop()
            videoCamTrack = null
            localVideo.srcObject = null
            removeMediaSenders(rtp_vid_senders)
        }
    }

    const videoProcess = async (newVideoState) => {
        if(newVideoState == video_states.None){
            $("#videoMute").html("<span class='material-icons'>videocam_off</span>").removeClass("setting_on")
            $("#screenShareMute").html("<span class='material-icons'>present_to_all</span><div>Демонстрация экрана</div>")

            video_st = newVideoState

            removeVideoStream(rtp_vid_senders)
            return
        }
        if(newVideoState == video_states.Camera){
            $("#videoMute").html("<span class='material-icons'>videocam</span>").addClass("setting_on")
        }
        if(newVideoState == video_states.ScreenShare){
            $("#screenShareMute").html("<span class='material-icons'>present_to_all</span><div>Вы демонстрируете экран</div>")
        }
        try {
            let vStream = null

            if(newVideoState == video_states.Camera){
                if(!navigator.mediaDevices.getUserMedia({video: {width: 1920,height: 1080}, audio: false})){
                    $("#warningVideoOff").trigger("click")
                }

                vStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 1920,
                        height: 1080
                    },
                    audio: false
                })
            } else if(newVideoState == video_states.ScreenShare){
                vStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: 1920,
                        height: 1080
                    },
                    audio: false
                })
                vStream.oninactive = (event) => {
                    removeVideoStream(rtp_vid_senders)
                    $("#screenShareMute").html("<span class='material-icons'>present_to_all</span><div>Демонстрация экрана</div>")
                }
            }

            if(vStream && vStream.getVideoTracks().length > 0){
                videoCamTrack = vStream.getVideoTracks()[0]

                if(videoCamTrack){
                    localVideo.srcObject = new MediaStream([videoCamTrack])
                    updateMediaSenders(videoCamTrack, rtp_vid_senders)
                }
            }
        } catch (err) {
            console.log(e);
            return
        }

        video_st = newVideoState
            
        if(newVideoState == video_states.Camera){
            $("#videoMute").html("<span class='material-icons'>videocam</span>").addClass("setting_on")

            $("#screenShareMute").html("<span class='material-icons'>present_to_all</span><div>Демонстрация экрана</div>")
        } else if(newVideoState == video_states.ScreenShare){
            $("#videoMute").html("<span class='material-icons'>videocam_off</span>").removeClass("setting_on")

            $("#screenShareMute").html("<span class='material-icons'>present_to_all</span><div>Вы демонстрируете экран</div>")
        }
    }

    const loadAudio = async () => {
        try {
            let astream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            })

            audio = astream.getAudioTracks()[0]
            audio.enabled = false
        } catch(err){
            console.log(err);
        }
    }

    function eventProcess(){
        $("#microMute").on("click", async () => {
            if(!audio){
                await loadAudio()
            }
            if(!audio){
                $("#warningAudioOff").trigger("click")
                return
            }
            if(isAudioMute){
                audio.enabled = true
                $("#microMute").html("<span class='material-icons'>mic</span>").addClass("setting_on")
                updateMediaSenders(audio, rtp_aud_senders)
            } else {
                audio.enabled = false
                $("#microMute").html("<span class='material-icons'>mic_off</span>").removeClass("setting_on")
                removeMediaSenders(rtp_aud_senders)
            }

            isAudioMute = !isAudioMute
        })

        $("#videoMute").on("click", async () => {
            if(video_st == video_states.Camera){
                await videoProcess(video_states.None)
            } else {
                await videoProcess(video_states.Camera)
            }
        })

        $("#screenShareMute").on("click", async () => {
            if(video_st == video_states.ScreenShare){
                await videoProcess(video_states.None)
            } else {
                await videoProcess(video_states.ScreenShare)
            }
        })
    }

    const setOffer = async (connId) => {
        let connection = peersConnection[connId]
        let offer = await connection.createOffer()

        await connection.setLocalDescription(offer)

        serverProcess(JSON.stringify({
            offer: connection.localDescription
        }), connId)
    }

    const setConnection = async (connId) => {
        let connection = new RTCPeerConnection(iceConfiguration)

        connection.onnegotiationneeded = async (event) => {
            await setOffer(connId)
        }

        connection.onicecandidate = (event) => {
            if(event.candidate){
                serverProcess(JSON.stringify({icecandidate: event.candidate}), connId)
            }
        }

        connection.ontrack = (event) => {
            if(!remote_vid_stream[connId]){
                remote_vid_stream[connId] = new MediaStream()
            }

            if(!remote_aud_stream[connId]){
                remote_aud_stream[connId] = new MediaStream()
            }

            if(event.track.kind == "video"){
                remote_vid_stream[connId]
                    .getVideoTracks()
                    .forEach(videoStream => remote_vid_stream[connId].removeTrack(videoStream))
                
                remote_vid_stream[connId].addTrack(event.track)

                let remoteVideoPlayer = document.getElementById("v_" + connId)
                remoteVideoPlayer.srcObject = null
                remoteVideoPlayer.srcObject = remote_vid_stream[connId]
                remoteVideoPlayer.load()

            } else if(event.track.kind == "audio"){
                remote_aud_stream[connId]
                    .getAudioTracks()
                    .forEach(audioStream => remote_aud_stream[connId].removeTrack(audioStream))
            
                remote_aud_stream[connId].addTrack(event.track)

                let remoteAudioPlayer = document.getElementById("a_" + connId)
                remoteAudioPlayer.srcObject = null
                remoteAudioPlayer.srcObject = remote_aud_stream[connId]
                remoteAudioPlayer.load()
            }
        }

        peersConnectionIds[connId] = connId
        peersConnection[connId] = connection

        if(video_st == video_states.Camera || video_st == video_states.ScreenShare){
            if(videoCamTrack){
                updateMediaSenders(videoCamTrack, rtp_vid_senders)
            }
        }

        return connection
        
    }

    const SDPProcess = async (message, from_connId) => {
        message = JSON.parse(message)

        if(message.answer){
            await peersConnection[from_connId].setRemoteDescription(new RTCSessionDescription(message.answer))

        } else if(message.offer){
            if(!peersConnection[from_connId]){
                await setConnection(from_connId)
            } 

            await peersConnection[from_connId].setRemoteDescription(new RTCSessionDescription(message.offer))

            let answer = await peersConnection[from_connId].createAnswer()
            await peersConnection[from_connId].setLocalDescription(answer)

            
            serverProcess(JSON.stringify({
                answer
            }), from_connId)
        } else if(message.icecandidate){
            if(!peersConnection[from_connId]){
                await setNewConnection(from_connId)
            }
            try {
                await peersConnection[from_connId].addIceCandidate(message.icecandidate)
            } catch (err) {
                console.log(err);
            }
        }
    }

    const closeConnection = async (connId) => {
        peersConnectionIds[connId] = null
        if(peersConnection[connId]){
            peersConnection[connId].close()
            peersConnection[connId] = null 
        }

        if(remote_aud_stream[connId]){
            remote_aud_stream[connId].getTracks().forEach((track) => {
                if(track.stop){
                    track.stop()
                }
            })
            remote_aud_stream[connId] = null
        }

        if(remote_vid_stream[connId]){
            remote_vid_stream[connId].getTracks().forEach((track) => {
                if(track.stop){
                    track.stop()
                }
            })
            remote_vid_stream[connId] = null
        }
    }

    return {
        setNewConnection: async (connId) => {
            await setConnection(connId)
        },
        init: async (SDP_fn, myConnId) => {
            await _init(SDP_fn, myConnId)
        },
        processClientFunc: async (data, from_connId) => {
            await SDPProcess(data, from_connId)
        },
        closeConnectionCall: async(connId) => {
            await closeConnection(connId)
        }
    }
})()



let app = (() => {
    let socket = null,
        userId,
        meetingId

    const addUser = (userId, connId, userCount) => {
        let templatePage = $("#otherTemplate").clone()

        templatePage = templatePage.attr("id", connId).addClass("other")
        templatePage = templatePage.removeClass("userbox")
        templatePage.find("h2").text(userId)

        templatePage.find("video").attr("id", "v_" + connId)
        templatePage.find("audio").attr("id", "a_" + connId)
        
        templatePage.show()

        $("#divUsers").append(templatePage)

        $(".in-call-wrap-up").append(`
        <div 
            class="in-call-wrap d-flex justify-content-between align-items-center mb-3"
            id="participant_${connId}"
        >
            <div class="participant-img-name-wrap display-center cursor-pointer">
                <div class="participant-img">

                    <img src="./public/Assets/images/other.jpg" class="border border-secondary user-image">
                </div>
                <div class="participant-name ms-4">${userId}</div>
            </div>
            <div class="participant-action-wrap display-center cursor-pointer">
                <div class="participant-action-dot display-center me-2">
                    <span class="material-icons cursor-pointer">more_vert</span>
                </div>
                <div class="participant-action-pin display-center me-2">
                    <span class="material-icons cursor-pointer">push_pin</span>
                </div>
            </div>
        </div>
        `)

        $(".participant-count").text(userCount)
        $(".top-left-participant-count").text(userCount)
    }

    const formatData = () => {
        let time = new Date()
        let lTime = time.toLocaleString("ru-RU", {
            hour: "numeric",
            minute: "numeric",
            hour24: true
        })

        return lTime
    }

    const addMessage = (userId, message, time) => {
        let template = `
        <div class="mt-2">
          <span class="font-weight-bold me-3"><b>${userId}</b></span> ${time} <br> ${message}
        </div>
      `

      $("#messages").append(template)
    }

    const event_process_for_signaling_server = () => {
        socket = io.connect()

        let SDP_fn = (data, to_connId) => {
            socket.emit("SDPProcess", { 
                message: data, 
                to_connId
            })
        }

        socket.on("connect", () => {
            if(socket.connected){

                AppProcess.init(SDP_fn, socket.id)

                if(userId || meetingId){
                    socket.emit("userconnect", {
                        displayName: userId, 
                        meetingId
                    })
                }
            }
        })

        socket.on("info_other_about_me", data => {
            addUser(data.otherUserId, data.connId, data.userCount)
            AppProcess.setNewConnection(data.connId)
        })

        socket.on("info_me_about_other", other_users => {
            let userCount = other_users.length
            let userNumber = userCount + 1
            
            if(other_users){
                for(let i = 0; i < other_users.length; i++){
                    addUser(other_users[i].userId, other_users[i].connectionId, userNumber)
                    AppProcess.setNewConnection(other_users[i].connectionId)
                }
            }
        })

        socket.on("inform_about_connection_end", data => {
            $("#" + data.connId).remove()
            $(".participant-count").text(data.userCount)
            $(".top-left-participant-count").text(data.userCount)
            $("#participant_" + data.connId).remove()

            $("#message-user-exit").html('Пользователь <span class="user-info-exit">'+data.displayName+'</span> покинул конференцию')
            $("#warnUserExit").trigger("click")

            AppProcess.closeConnectionCall(data.connId)
        })

        socket.on("SDPProcess", async data => {
            await AppProcess.processClientFunc(data.message, data.from_connId)
        })

        socket.on("show_message", data => {
            let time = formatData()
    
            addMessage(data.from, data.message, time)
        })

        socket.on("show_message_file", data => {
            let time = formatData()

            let attachFile = document.querySelector(".show-attach-file")
            attachFile.innerHTML += `
            <div class="left-align d-flex align-items-center item-load-file-show">
                <img src="public/assets/images/other.jpg" style="height: 40px; width: 40px;border-radius:50%;" class="caller-image circle me-3">
                <div class="d-flex flex-column">
                    <div class="d-flex align-items-center">${data.userId} <span class="ms-3 micro-time">${time}</span></div>
                    <a href="${data.attachFilePath}" style="color: #0000FF;" download target="_blank" class="link-file-down">${data.fileName}</a>
                </div>
            </div> 
            <br>`
    
            addMessage(data.userId, "Пользователь добавил файл", time)
        })
    }

    const eventHandling = () => {
        $("#btn-send-message").on("click", () => {
            socket.emit("send_message", $("#message").val())
            
            let time = formatData()
    
            addMessage(userId, $("#message").val(), time)

            $("#message").val("")
        })

        let url = window.location.href
        $('.meeting_url').text(url);
        $('.meeting_code').text(meetingId);

        $("#divUsers").on("dblclick", "video", (e) => {
            if(e.target.localName === "video"){
                e.target.requestFullscreen()
            }
        })
    }

    const init = (uid, mid) => {
        userId = uid
        meetingId = mid

        $("#meetingContainer").show()
        $("#meetingContainer").removeClass("d-none")
        $("#me h2").text(userId + " (Я)")
        document.title = userId
        
        event_process_for_signaling_server()
        eventHandling()
    }

    $(document).on("click", ".copy_info", () => {
        let $temp = $("<input>")
        $("body").append($temp)
        $temp.val($(".meeting_url").text()).select()
        document.execCommand("copy")
        $temp.remove()
        $(".copy-link").show()

        setTimeout(() => {
            $(".copy-link").hide()
        }, 3000)
    })

    $(document).on("click", ".copy_code", () => {
        let $temp = $("<input>")
        $("body").append($temp)
        $temp.val($(".meeting_code").text()).select()
        document.execCommand("copy")
        $temp.remove()
        $(".copy-code").show()

        setTimeout(() => {
            $(".copy-code").hide()
        }, 3000)
    })

    $(document).on("click", ".meeting-details-button", () => {
        $(".g-details").slideToggle(300)
    })

    $(document).on("click", ".option-icon", () => {
        $(".recording-show").slideToggle(300)
    })

    $(document).on("click", ".g-details-heading-attachment", () => {
        $(".g-details-heading-show").hide()
        $(".g-details-heading-show-attachment").show()
    })

    $(document).on("click", ".g-details-heading-detail", () => {
        $(".g-details-heading-show-attachment").hide()
        $(".g-details-heading-show").show()
    })

    $(".moment_message").each((i, element) => {
        $(element).on("click", (e) => {
            let message = e.target.innerText.repeat(5)

            console.log(message);

            socket.emit("send_message", message)
            
            let time = formatData()
    
            addMessage(userId, message, time)
        })
    })

    let mediaRecorder
    let chanks = []

    const captureScreen = async (mediaContrains = { video: true }) => {
        let screenStream = await navigator.mediaDevices.getDisplayMedia(mediaContrains)
        return screenStream
    }

    const captureAudio = async (mediaContrains = { video: false, audio: true }) => {
        let audioStream = await navigator.mediaDevices.getUserMedia(mediaContrains)
        return audioStream
    }

    const startRecording = async () => {
        let screenStream = await captureScreen()
        let audioStream = await captureAudio()

        const stream = new MediaStream([
            ...screenStream.getTracks(), 
            ...audioStream.getTracks()
        ])

        mediaRecorder = new MediaRecorder(stream)
        mediaRecorder.start()

        mediaRecorder.onstop = (e) => {
            let clipName = uuid.v4()

            stream.getTracks().forEach(track => track.stop())

            const blob = new Blob(chanks, {
                type: "video/webm"
            })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.style.display = "none"
            link.href = url
            link.download = clipName + ".webm"
            document.body.appendChild(link)
            link.click()

            setTimeout(() => {
                document.body.removeChild(link)
                window.URL.revokeObjectURL(url)
            }, 100)
        }

        mediaRecorder.ondataavailable = (e) => {
            chanks.push(e.data)
        }
    }

    $(document).on("click", ".save-meet", () => {
        $(".save-meet").text("Остановить запись").addClass("stop-meet").removeClass("save-meet")

        startRecording()
    })

    $(document).on("click", ".stop-meet", () => {
        $(".stop-meet").text("Начать запись").addClass("save-meet").removeClass("stop-meet")
        mediaRecorder.stop()
    })

    let baseUrl = window.location.origin
    
    $(document).on("click", ".share-attach", (e) => {
        e.preventDefault()

        let fileUpload = $("#customFile").prop('files')[0]
        
        let originFileName = $("#customFile").val().split("\\").pop()
        let extension = originFileName.split(".")
        extension = extension[extension.length - 1]

        let fileName = uuid.v4() + "." + extension

        let formData = new FormData()

        formData.append("meet_file", fileUpload)
        formData.append("meeting_id", meetingId)
        formData.append("username", userId)
        formData.append("fileName", fileName)

        $.ajax({
            url: baseUrl + "/attach",
            type: "POST",
            data: formData,
            contentType: false,
            processData: false,
            success: (res) => {
                console.log(res);
            }, 
            error: () => {
                console.log('error');
            }
        })

        let attachFileArea = document.querySelector(".show-attach-file")
        
        let attachFilePath = "public/attachment/" + meetingId + "/" + fileName
            
        let time = formatData()

        attachFileArea.innerHTML += `
        <div class="left-align d-flex align-items-center item-load-file-show">
            <img src="public/assets/images/other.jpg" style="height: 40px; width: 40px;border-radius:50%;" class="caller-image circle me-3">
            <div class="d-flex flex-column">
                <div class="d-flex align-items-center">${userId} <span class="ms-3 micro-time">${time}</span></div>
                <a href="${attachFilePath}" style="color: #0000FF;" download target="_blank" class="link-file-down">${fileName}</a>
            </div>
        </div> 
        <br>`

        socket.emit("file_transfer_to_other", {
            userId,
            meetingId,
            attachFilePath,
            fileName
        })
    })

    return {
        _init: (uid, mid) => {
            init(uid, mid)
        }
    }
})()