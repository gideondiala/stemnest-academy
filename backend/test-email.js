require('dotenv').config();
const { sendEmail } = require('./src/services/emailService');

sendEmail({
  to: 'gideondiala1@gmail.com',
  subject: 'StemNest Academy - Email Test',
  html: '<h1>It works</h1><p>AWS SES is sending emails from stemnestacademy.co.uk</p>',
  template: 'test'
})
.then(r => console.log('SUCCESS:', JSON.stringify(r)))
.catch(e => console.error('FAILED:', e.message));
