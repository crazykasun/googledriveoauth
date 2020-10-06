const express = require('express')
const app = express()
const fs = require('fs')
const multer = require('multer')    //library to upload files
const {google} = require('googleapis')  //import google api module
const oAuth = require('./drive_credentials.json')   //import google oauth credentials

//info that needed to access from google api which are profile info and drive info
const apiScope = ['https://www.googleapis.com/auth/drive ' +
'https://www.googleapis.com/auth/drive.metadata.readonly ' +
'https://www.googleapis.com/auth/userinfo.profile ' +
'https://www.googleapis.com/auth/drive.file']

//store oauth credentials in variables
const CLIENT_ID = oAuth.web.client_id
const CLIENT_SECRET = oAuth.web.client_secret
const REDIRECT_URIS = oAuth.web.redirect_uris[0]

//create oauth2 client object using stored credentials
const oAuthClient = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URIS
)

app.use(express.static(__dirname + '/public'));

let userName, photo //variables for store username and photo of the user
let isSuccess = 'no'
let authenticated = false   //variable for store authenticated status

//set ejs template engine
app.set("view engine", "ejs")

app.get('/', (req, res) => {
    if (authenticated) {
        //if authenticated, extract user data
        let user = google.oauth2({
            auth: oAuthClient,
            version: 'v2'
        })
        user.userinfo.get(function (err, res2) {
            if (err) {
                console.log(err)
            } else {
                //if no error store user name and photo
                userName = res2.data.name
                photo = res2.data.picture

                //render home page by giving user data
                res.render("home", {name: userName, photo: photo, success: 'no'})
            }
        })
    } else {
        // if user not authenticated, generate url to get the access token
        let url = oAuthClient.generateAuthUrl({
            access_type: 'offline',
            scope: apiScope //info that need to access
        })
        res.render("index", {url: url}) //redirect to the generated url
    }
})

//handle callback function coming from google
app.get('/google/callback', (req, res) => {
    const authCode = req.query.code //store authorization code
    if (authCode) {
        //get access token for the auth code
        oAuthClient.getToken(authCode, function (err, token) {
            if (err) {
                console.log(err)
            } else {
                oAuthClient.setCredentials(token)   //set access credentials
                authenticated = true    //set status as authenticated

                res.redirect('/')   //redirect to the homepage
            }
        })
    }
})

//give location to save file and unique file name
let fileStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, "./files/uploads");
    },
    filename: function (req, file, callback) {
        callback(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
    },
});

//upload files to the local directory
let uploadFile = multer({
    storage: fileStorage,
}).array("file", 5);

//handle file upload request
app.post('/upload', (req, res) => {
    uploadFile(req, res, function (err) {
        let fileKeys = Object.keys(req.files);  //get uploaded files to the local directory

        //loop thorough each file
        fileKeys.forEach(function (key) {
            if (err) {
                console.log(err)
            } else {
                // if no error get google drive info
                const gDrive = google.drive({
                    version: 'v3',
                    auth: oAuthClient
                })
                //get file name
                const fileMetaData = {
                    name: req.files[key].filename
                }
                //get file from the file stream
                const media = {
                    mimeType: req.files[key].mimeType,
                    body: fs.createReadStream(req.files[key].path)
                }

                //method to upload file to the google drive
                gDrive.files.create({
                    resource: fileMetaData,
                    media: media,
                    fields: "id"
                }, (err, file) => {
                    if (err) {
                        console.log(err)
                    } else {
                        //if no error, delete locally uploaded file and redirect
                        fs.unlinkSync(req.files[key].path)
                        res.render('home', {name: userName, photo: photo, success: 'yes'})
                    }
                })
            }
        });
    })
})

//list files in drive
app.get('/read', (req, res2) => {
    let getFiles = ''
    const drive = google.drive({version: 'v3', auth: oAuthClient});
    drive.files.list({
        pageSize: 10    //get maximum 10 files
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);   //if error print message
        const files = res.data.files;
        if (files.length) {
            //create html code segment using file names
            files.map((file) => {
                getFiles += '<div class="row"><div class="col-sm-8"><li class="text-left">' + (file.name).substr(0, 40) + '</li></div>' +
                    '<div class="col-sm-2"><form action="/downloadFile/' + file.id + '/' + file.name + '" method="post">' +
                    '    <button class="btn btn-sm btn-primary" name="download">Download</button>' +
                    '</form></div>' +
                    '<div class="col-sm-2"><form action="/deleteFile/' + file.id + '" method="post">' +
                    '    <button class="btn btn-sm btn-danger" name="download">Delete</button>' +
                    '</form></div></div><br>'
            });
        } else {
            console.log('No files found.');
        }
        //render view page using created html code
        res2.render('view', {name: userName, photo: photo, success: isSuccess, fileArr: getFiles})
        isSuccess = 'no'
    });
})

//post request to download a file
app.post('/downloadFile/:id/:name', (req, res) => {
    //get file id and name
    let fileId = req.params.id;
    let fileName = req.params.name;
    let filePath = './files/downloads/' + fileName; //set file path to download
    let dest = fs.createWriteStream(filePath);
    const drive = google.drive({version: 'v3', auth: oAuthClient});
    //get file from drive
    drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, {responseType: 'stream'}
    ).then(response => {
        response.data
            .on('end', () => {
                console.log('Done');
            })
            .on('error', err => {
                console.log('Error', err);
            })
            .pipe(dest);    //download file to the server
        //download retrieved file using browser
        res.download(filePath, function(err) {
            if (err) {
                console.log('Error in Download')
            } else {
                fs.unlinkSync(filePath) //delete file from server side
            }
        })
    })
})

//post request to delete file
app.post('/deleteFile/:id', (req, res) => {
    let fileId = req.params.id;
    const drive = google.drive({version: 'v3', auth: oAuthClient});
    //delete file from drive
    drive.files.delete({
        fileId: fileId
    }).then((response) => {
        isSuccess = 'yes'
        res.redirect('/read')
    })
})

//method to logout
app.get('/logout', (req, res) => {
    authenticated = false
    res.redirect('/')
})

//start app on port 5000
app.listen(5000, () => {
    console.log("Running on Port 5000")
})
