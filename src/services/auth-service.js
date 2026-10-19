
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/app-error.js";

const PASSWORD_MIN_LENGTH = 12;

function validatePassword(password) {
  if (typeof password !== "string") {
    throw new AppError(
      400,
      "Password is required.",
      "INVALID_PASSWORD"
    );
  }

  if (
    password.length < PASSWORD_MIN_LENGTH ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new AppError(
      400,
      "Password must contain at least 12 characters, including an uppercase letter, a lowercase letter, a number, and a special character.",
      "INVALID_PASSWORD"
    );
  }
}

export class AuthService {
  constructor({ userRepository, jwtSecret, jwtExpiresIn }) {
    this.userRepository = userRepository;
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
  }

  async register({ name, email, password, role, licenseId }) {
    if (typeof email !== "string" || !email.trim()) {
      throw new AppError(400, "Email is required.", "INVALID_EMAIL");
    }

    validatePassword(password);

    const allowedRoles = ["patient", "doctor", "pharmacy"];

    if (!allowedRoles.includes(role)) {
      throw new AppError(400, "Invalid account role.", "INVALID_ROLE");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedLicenseId =
      typeof licenseId === "string" ? licenseId.trim() : "";

    if (
      (role === "doctor" || role === "pharmacy") &&
      !normalizedLicenseId
    ) {
      throw new AppError(
        400,
        "A professional license number is required.",
        "LICENSE_REQUIRED"
      );
    }

    if (role === "patient" && normalizedLicenseId) {
      throw new AppError(
        400,
        "Patients must not provide a professional license number.",
        "INVALID_LICENSE"
      );
    }

    if (await this.userRepository.findByEmail(normalizedEmail)) {
      throw new AppError(
        409,
        "An account with this email already exists.",
        "EMAIL_TAKEN"
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const status =
      role === "doctor" || role === "pharmacy"
        ? "pending"
        : "active";

    // This generates an address identifier; it does not create
    // or verify an on-chain wallet.
    const blockchainAddress =
      `0x${crypto.randomBytes(20).toString("hex")}`;

    const user = await this.userRepository.create({
      name:
        typeof name === "string" && name.trim()
          ? name.trim()
          : normalizedEmail.split("@")[0],
      email: normalizedEmail,
      passwordHash,
      role,
      status,
      blockchainAddress,
      licenseId: normalizedLicenseId || null,
    });

    return {
      user: this.publicUser(user),
      token:
        status === "active" ? this.createToken(user) : null,
    };
  }

  async login({ email, password }) {
    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      throw new AppError(
        400,
        "Email and password are required.",
        "INVALID_LOGIN_INPUT"
      );
    }

    const user = await this.userRepository.findByEmail(
      email.trim().toLowerCase()
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError(
        401,
        "Invalid email or password.",
        "INVALID_CREDENTIALS"
      );
    }

    if (user.status === "pending") {
      throw new AppError(
        403,
        "Your account is awaiting admin approval.",
        "ACCOUNT_PENDING"
      );
    }

    if (user.status === "rejected") {
      throw new AppError(
        403,
        "This account has been deactivated.",
        "ACCOUNT_REJECTED"
      );
    }

    return {
      user: this.publicUser(user),
      token: this.createToken(user),
    };
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch {
      throw new AppError(
        401,
        "Invalid or expired token.",
        "INVALID_TOKEN"
      );
    }
  }

  createToken(user) {
    const payload = {
      role: user.role,
      email: user.email,
      sub: user.id,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  publicUser(user) {
    return {
      id: user.id,
      name: user.name || user.email?.split("@")[0] || "User",
      email: user.email,
      role: user.role,
      status: user.status,
      patientId:
        user.role === "patient" ? user.patient_id ?? null : null,
      blockchainAddress:
        user.blockchain_address ?? user.blockchainAddress ?? null,
      licenseId:
        user.license_id ?? user.licenseId ?? null,
      createdAt: user.created_at ?? user.createdAt ?? null,
    };
  }
}
