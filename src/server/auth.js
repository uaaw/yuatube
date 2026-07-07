"use strict";

const crypto = require("crypto");
const cookieParser = require("cookie-parser");

const COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(32).toString("hex");

function parseCookieHeader(header) {
  const cookies = Object.create(null);
  if (!header) return cookies;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookies[key] = val;
  });
  return cookies;
}

function isAuthed(req) {
  return req.signedCookies && req.signedCookies.gen_access === "ok";
}

function checkAuthFromHeaders(cookieHeader, secret) {
  const cookies = parseCookieHeader(cookieHeader);
  const value = cookies.gen_access;
  if (!value) return false;
  return cookieParser.signedCookie(value, secret) === "ok";
}

module.exports = {
  COOKIE_SECRET,
  isAuthed,
  checkAuthFromHeaders,
};