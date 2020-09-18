const express = require('express')
const app = express()
const fs = require('fs')
const multer = require('multer')
const {google} = require('googleapis')
const oAuth = require('./drive_credentials.json')
const apiScope = "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.file"

const CLIENT_ID = oAuth.web.client_id
const CLIENT_SECRET = oAuth.web.client_secret
const REDIRECT_URIS = oAuth.web.redirect_uris[0]

const oAuthClient = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URIS
)

app.use(express.static(__dirname + '/public'));

let userName, photo

let authenticated = false

app.set("view engine", "ejs")

app.get('/', (req, res) => {
    if (authenticated) {
        let user = google.oauth2({
            auth: oAuthClient,
            version: 'v2'
        })
        user.userinfo.get(function (err, res2) {
            if (err) {
                console.log(err)
            } else {
                userName = res2.data.name
                photo = res2.data.picture

                res.render("home", {name: userName, photo: photo, success: 'no'})
            }
        })

    } else {
        let url = oAuthClient.generateAuthUrl({
            access_type: 'offline',
            scope: apiScope
        })
        res.render("index", {url: url})
    }
})

app.get('/google/callback', (req, res) => {
    const authCode = req.query.code
    if (authCode) {
        oAuthClient.getToken(authCode, function (err, token) {
            if (err) {
                console.log(err)
            } else {
                console.log(token)
                oAuthClient.setCredentials(token)
                authenticated = true

                res.redirect('/')
            }
        })
    }
})

let fileStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, "./images");
    },
    filename: function (req, file, callback) {
        callback(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
    },
});

let uploadFile = multer({
    storage: fileStorage,
}).array("file", 5);

app.post('/upload', (req, res) => {
    uploadFile(req, res, function (err) {
        let fileKeys = Object.keys(req.files);

        fileKeys.forEach(function (key) {
            if (err) {
                console.log(err)
            } else {
                const gDrive = google.drive({
                    version: 'v3',
                    auth: oAuthClient
                })

                const fileMetaData = {
                    name: req.files[key].filename
                }

                const media = {
                    mimeType: req.files[key].mimeType,
                    body: fs.createReadStream(req.files[key].path)
                }

                gDrive.files.create({
                    resource: fileMetaData,
                    media: media,
                    fields: "id"
                }, (err, file) => {
                    if (err) {
                        console.log(err)
                    } else {
                        fs.unlinkSync(req.files[key].path)
                        res.render('home', {name: userName, photo: photo, success: 'yes'})
                    }
                })
            }
        });
    })
})

app.get('/logout', (req, res) => {
    authenticated = false
    res.redirect('/')
})

app.listen(5000, () => {
    console.log("Running on Port 5000")
})
