var express = require('express');
var router = express.Router();

const userModel = require("../models/user.model"); // Ensure you have a User model
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

/* GET home page. */
// router.get('/', function(req, res, next) {
 
// });
const JWT_SECRET = process.env.JWT_SECRET; // Change this in production


// SIGNUP API

router.post("/signUp", async (req, res) => {
  try {
    const { FirstName, LastName, Email, Password, PetName, FatherName } = req.body;

    // Validate input
    if (!FirstName || !LastName || !Email || !Password || !PetName || !FatherName) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user already exists
    let existingUser = await userModel.findOne({ Email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(Password, salt);

    // Create user
    const newUser = new userModel({
      FirstName,
      LastName,
      Email,
      Password: hashedPassword,
      PetName,
      FatherName,
    });

    await newUser.save();

    return res.status(201).json({
      message: "User registered successfully",
      data: {
        id: newUser._id,
        FirstName: newUser.FirstName,
        LastName: newUser.LastName,
        Email: newUser.Email,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// SIGNIN API
router.post("/signIn", async (req, res) => {
  try {
    const { Email, Password } = req.body;

    // Validate input
    if (!Email || !Password) {
      return res.status(400).json({ message: "Email and Password are required" });
    }

    // Find user by email
    let user = await userModel.findOne({ Email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(Password, user.Password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        FirstName: user.FirstName,
        LastName: user.LastName,
        Email: user.Email,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
// FORGOT PASSWORD API (No Email Required)
router.post("/forgotPassword", async (req, res) => {
  try {
    const { Email, PetName, FatherName, newPassword } = req.body;

    // Validate input
    if (!Email || !PetName || !FatherName || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Find user
    let user = await userModel.findOne({ Email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Check security questions
    if (user.PetName !== PetName || user.FatherName !== FatherName) {
      return res.status(400).json({ message: "Security answers are incorrect" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.Password = hashedPassword;
    await user.save();

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;

