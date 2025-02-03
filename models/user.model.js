const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  FirstName: { type: String, required: true },
  LastName: { type: String, required: true },
  Email: { type: String, required: true, unique: true },
  Password: { type: String, required: true },
  PetName: { type: String, required: true },   // Security Question 1
  FatherName: { type: String, required: true }, // Security Question 2
  UserCreationTime: { type: Date, default: Date.now }, // Account creation time
});
  module.exports = mongoose.model("User", userSchema);
