// Google Cloud Functions entry point
// This file exports the Express app for Cloud Functions/Cloud Run

const app = require('./server');

// For Cloud Functions, export the app
// Cloud Functions will automatically handle the Express app
module.exports = app;

