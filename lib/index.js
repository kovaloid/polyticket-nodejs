const https = require('https');
const querystring = require('querystring');
const nodemailer = require('nodemailer');
const properties = require('properties-reader')('config/app.properties');

const baseURL = 'https://mylpu.vistamed.ru/ntrk/';

const emailService = properties.get('email.service'),
      emailUser = properties.get('email.user'),
      emailPass = properties.get('email.pass'),
      intervalSeconds = properties.get('interval.seconds'),
      monthOffset = properties.get('month.offset'),
      clinicId = properties.get('clinic.id'),
      doctorId = properties.get('doctor.id'),
      patientId = properties.get('patient.id'),
      patientLastName = properties.get('patient.last.name'),
      patientFirstName = properties.get('patient.first.name'),
      patientPatrName = properties.get('patient.patr.name'),
      patientBirthDate = properties.get('patient.birth.date'),
      appointmentId = properties.get('appointment.id');

var transporter = nodemailer.createTransport({
    service: emailService,
    auth: {
        user: emailUser,
        pass: emailPass
    }
});

var mailOptions = {
    from: emailUser,
    to: emailUser,
    subject: 'NodeJS PolyTicket',
    text: 'Ticket available!'
};

if (process.argv.length <= 2) {
    console.log('Usage: ');
    console.log('    ' + __filename + ' --get-patient-id');
    console.log('    ' + __filename + ' --get-appointments');
    console.log('    ' + __filename + ' --set-appointment');
    console.log();
    printProperties();
    process.exit(-1);
}

function printProperties() {
    console.log('Properties:');
    console.log('    Email service:      ' + emailService);
    console.log('    Email user:         ' + emailUser);
    console.log('    Email pass:         ' + emailPass);
    console.log('    Interval seconds:   ' + intervalSeconds);
    console.log('    Month offset:       ' + monthOffset);
    console.log('    Clinic ID:          ' + clinicId);
    console.log('    Doctor ID:          ' + doctorId);
    console.log('    Patient ID:         ' + patientId);
    console.log('    Patient last name:  ' + patientLastName);
    console.log('    Patient first name: ' + patientFirstName);
    console.log('    Patient patr name:  ' + patientPatrName);
    console.log('    Patient birth date: ' + patientBirthDate);
}

switch (process.argv[2]) {
    case '--get-patient-id':
        getPatiendId();
        break;
    case '--get-appointments':
        getAppointments();
        break;
    case '--set-appointment':
        setAppointment();
        break;
    default:
        break;
}

function getPatiendId() {
    var lastName = encodeURIComponent(patientLastName),
        firstName = encodeURIComponent(patientFirstName),
        patrName = encodeURIComponent(patientPatrName),
        birthDate = encodeURIComponent(patientBirthDate);
    log('Original/encoded patient parameters:');
    log('    Last Name:   ' + patientLastName + '\t/ ' + lastName);
    log('    First Name:  ' + patientFirstName + '\t/ ' + firstName);
    log('    Patr Name:   ' + patientPatrName + '\t/ ' + patrName);
    log('    Birth Date:  ' + patientBirthDate + '\t/ ' + birthDate);
    log('[REQUEST] checkPatient');
    https.get(baseURL + 'checkPatient?idLpu=' + clinicId + '&lastName=' + lastName + '&firstName=' + firstName + '&patrName=' + patrName + '&birthDate=' + birthDate + '&num=1', (resp) => {
        var data = '';
        if (resp.statusCode !== 200) {
            log('[FAILURE] Could not get Patient ID');
        } else {
            log('[SUCCESS] Patient ID was received');
        }
        resp.on('data', function (chunck) {
            data += chunck;
        })
        resp.on('end', function () {
            log('Response:');
            log(data);
            log('Encoded response:');
            log(encodeURIComponent(data));
        })
    }).on('error', (err) => {
        log('[ERROR] ' + err.message);
    });
}

function getLogTime() {
    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

function log(message) {
    console.log(getLogTime(), message);
}

function getAppointments() {
    var delay = parseInt(intervalSeconds);
    log('Start to reteive list of appointments every ' + delay + ' seconds');
    getAppointmentsHandler();
    if (delay > 0) {
        setInterval(getAppointmentsHandler, delay * 1000);
    }
}

function getAppointmentsHandler() {
    var searchFrom = getToday(),
        searchTo = getOffsetDay(parseInt(monthOffset));
    log('Search parameters:');
    log('    Search From:  ' + searchFrom);
    log('    Search To:    ' + searchTo);
    log('[REQUEST] availableAppointments');
    https.get(baseURL + 'availableAppointments?idLpu=' + clinicId + '&idDoctor=' + doctorId + '&searchFrom=' + searchFrom + '&searchTo=' + searchTo + '&num=1', (resp) => {
        if(resp.statusCode !== 200) {
            log('No tickets!');
        } else {
            var data = '';
            resp.on('data', function (chunck) {
                data += chunck;
            });
            resp.on('end', function () {
                if (data === '[]') {
                    log('No tickets!');
                } else {
                    log('[SUCCESS] Ticket available!');
                }
                JSON.parse(data).forEach(function (value) {
                    log('Vacant day and time: ' + value.start.replace(/T/, ' ') + '       id: ' + value.idAppointment);
                });
                sendEmail();
            });
        }
    }).on('error', (err) => {
        log('[ERROR] ' + err.message);
    });
}

function sendEmail() {
    if (!emailService || !emailUser || !emailPass) {
        log('Could not send email due to missing parameters');
        process.exit(0);
    }
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
            log('Closing application...');
            process.exit(0);
        }
    });
}

function getToday() {
    var today = new Date();
    return today.toISOString().substring(0, 10);
}

function getOffsetDay(monthOffset) {
    var today = new Date(),
        offsetDay;
    if (!monthOffset) {
        monthOffset = 1;
    }
    offsetDay = new Date(today.getFullYear(), today.getMonth() + monthOffset, today.getDate() + 1);
    return offsetDay.toISOString().substring(0, 10);
}

function setAppointment() {
    var postData = querystring.stringify({
        'idLpu': clinicId,
        'idPatient': patientId,
        'idAppointment': appointmentId,
        'num': 1
    });
    var options = {
        hostname: 'mylpu.vistamed.ru',
        port: 443,
        path: '/ntrk/setAppointment',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };
    log('Send POST request with payload:');
    log('    URL:        https://' + options.hostname + options.path);
    log('    Form Data:  ' + postData);
    log('[REQUEST] setAppointment');
    var req = https.request(options, (res) => {
        if(res.statusCode !== 200) {
            log('[FAILURE] Could not set Appointment');
        } else {
            log('[SUCCESS] Appointment was set');
        }
        res.on('data', (d) => {
            log('Response:');
            process.stdout.write(d);
        });
    });
    req.on('error', (e) => {
        console.error(e);
    });
    req.write(postData);
    req.end();
}
