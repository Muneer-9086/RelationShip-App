import { Request, Response } from "express";
import User from "../model/user.model";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = "RelationShip@007";

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { fullName, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      password: hashedPassword
    });

    res.status(201).json({ message: "User registered", userId: user._id });
  } catch (err) {
    res.status(500).json({ message: "Register error", err });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    console.log("LOGIN ENDPOINT____");
    const { email, password } = req.body;
    console.log({ email, password });


    const user = await User.findOne({ email }).select("password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log("___user__");
    console.log(user)

    const isMatch = await bcrypt.compare(password, user.password);
    console.log(`IS MATCH ${isMatch}`)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ message: "Login success", token,email:user["email"],_id:user["_id"] });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Login error", err });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    await user.save();

    // Normally send email here
    res.json({
      message: "Reset token generated",
      resetToken
    });
  } catch (err) {
    res.status(500).json({ message: "Forgot password error", err });
  }
};
