require("dotenv").config()
require("./utilities/database")
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors')

// Import all route files
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var userProfileRouter = require('./routes/user-profile');
var paymentsRouter = require('./routes/payments');
var videosRouter = require('./routes/videos');
var adminRouter = require('./routes/admin');

var app = express();
app.use(cors())
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Register all route handlers
app.use('/', indexRouter);
app.use('/users/api', usersRouter);
app.use('/profile', userProfileRouter);
app.use('/payments', paymentsRouter);
app.use('/videos', videosRouter);
app.use('/admin', adminRouter);

module.exports = app;
