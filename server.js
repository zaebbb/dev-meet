const express = require("express")
const path = require("path")
const fs = require("fs")
const uuid = require("uuid")
const fileUpload = require("express-fileupload")

const app = express()

let server = app.listen(3000, function(){
    console.log("Сервер запущен на 3000 порту");
})

const io = require("socket.io")(server, {
    allowEIO3: true
})

app.use(express.static(path.join(__dirname, "")))

let userConnections = []

io.on("connection", (socket) => {

    socket.on("userconnect", (data) => {

        let other_users = userConnections.filter(param => param.meetingId === data.meetingId)

        userConnections.push({
            connectionId: socket.id,
            userId: data.displayName,
            meetingId: data.meetingId,
        })

        let userCount = userConnections.length

        other_users.forEach(user => {
            socket.to(user.connectionId).emit("info_other_about_me", {
                otherUserId: data.displayName, 
                connId: socket.id,
                userCount
            })
        })

        socket.emit("info_me_about_other", other_users)
    })

    socket.on("SDPProcess", data => {
        socket.to(data.to_connId).emit("SDPProcess", {
            message: data.message,
            from_connId: socket.id
        })
    })

    socket.on("disconnect", () => {
        let disUser = userConnections.find(user => user.connectionId == socket.id)

        if(disUser){
            let meetingId = disUser.meetingId
            userConnections = userConnections.filter(user => user.connectionId != socket.id)

            let list = userConnections.filter(connection => connection.meetingId == meetingId)

            list.forEach(item => {
                let userCount = userConnections.length

                socket.to(item.connectionId).emit("inform_about_connection_end", {
                    connId: socket.id,
                    displayName: disUser.userId,
                    userCount
                })
            })
        }
    })

    socket.on("send_message", data => {
        let mUser = userConnections.find(user => user.connectionId == socket.id)
        if(mUser){
            let meetingId = mUser.meetingId
            let from = mUser.userId
            let list = userConnections.filter(user => user.meetingId == meetingId)

            list.forEach(item => {
                socket.to(item.connectionId).emit("show_message", {
                    from: from,
                    message: data
                })
            })
        }
    })

    socket.on("file_transfer_to_other", data => {
        let mUser = userConnections.find(user => user.connectionId == socket.id)
        if(mUser){
            let meetingId = mUser.meetingId
            let list = userConnections.filter(user => user.meetingId == meetingId)

            list.forEach(item => {
                socket.to(item.connectionId).emit("show_message_file", {
                    userId: data.userId,
                    meetingId: data.meetingId,
                    attachFilePath: data.attachFilePath,
                    fileName: data.fileName
                })
            })
        } 
    })
})

app.use(fileUpload())

app.post("/attach", (req, res) => {
    let data = req.body
    let file = req.files.meet_file

    let dir = "public/attachment/" + data.meeting_id + "/"
    let fileName = data.fileName

    if(!fs.existsSync(dir)){
        fs.mkdirSync(dir)
    }

    file.mv("public/attachment/" + data.meeting_id + "/" + fileName, (err) => {
        if(err){
            console.log("error upload file", error)
        } else {
            console.log("success upload file");
        }
    })
})