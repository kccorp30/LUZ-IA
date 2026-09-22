process.on("uncaughtException", function(err) {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});
process.on("unhandledRejection", function(reason) {
  console.error("UNHANDLED REJECTION:", reason);
});
const express = require("express");
const axios   = require("axios");
const path    = require("path");
const webpush = require("web-push");
const app     = express();
const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";
// Service key — buscar en múltiples nombres posibles
function readSupabaseSecretBundle() {
  try {
    var raw = process.env.SUPABASE_SECRET_KEYS;
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && (parsed.default || parsed.backend || Object.values(parsed)[0]) || null;
  } catch (e) { return null; }
}
const SUPABASE_SERVICE_KEY_VAL =
  // Mantener primero los nombres legacy si ya existen en Railway.
  // V10.2 firmaba las sesiones del domiciliario con esta prioridad; cambiarla
  // invalida tokens ya emitidos. Las claves nuevas sb_secret_ siguen soportadas.
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  readSupabaseSecretBundle() ||
  process.env.SUPABASE_ANON_KEY ||
  SUPABASE_KEY;
function sbPrivilegedHeaders(extra) {
  var key = SUPABASE_SERVICE_KEY_VAL;
  var h = Object.assign({ apikey: key }, extra || {});
  // Las nuevas claves sb_secret_/sb_publishable_ son opacas, no JWT.
  // Para las legacy service_role JWT mantenemos Authorization Bearer.
  if (!/^sb_(secret|publishable)_/i.test(String(key || ''))) h.Authorization = 'Bearer ' + key;
  return h;
}
function hasPrivilegedSupabaseKey() {
  var key = String(SUPABASE_SERVICE_KEY_VAL || '');
  return /^sb_secret_/i.test(key) || (key.startsWith('eyJ') && key !== String(SUPABASE_KEY || ''));
}
const FINDER_SERVER_SECRET = process.env.FINDER_SERVER_SECRET || "1dcLIWVzcBU4eUkNV4F0TdErKozdrPFU_YoRJlUXvTRQWcRlTlxKdGybgz7UGhCK";
// V14.1 AUTH TRANSPORT FIX — backend only.
// Supabase sb_secret_/sb_publishable_ keys are opaque API keys, NOT JWTs.
// Older routes still build `Authorization: Bearer <key>`; strip that invalid
// header centrally without changing the working business flows.
axios.interceptors.request.use(function(config){
  try {
    if (config && config.url && String(config.url).indexOf(SUPABASE_URL) === 0) {
      config.headers = config.headers || {};
      var apiKey = String(config.headers.apikey || config.headers["apikey"] || "");
      var auth = String(config.headers.Authorization || config.headers.authorization || "");
      if (/^sb_(secret|publishable)_/i.test(apiKey) && auth === "Bearer " + apiKey) {
        try { delete config.headers.Authorization; } catch(e) {}
        try { delete config.headers.authorization; } catch(e) {}
      }
      // If Railway only exposes a publishable key, preserve the server-side
      // Finder/RLS signal already used by this project. Never expose it to browser.
      if (/^sb_publishable_/i.test(apiKey) && FINDER_SERVER_SECRET && !config.headers["x-finder-server"]) {
        config.headers["x-finder-server"] = FINDER_SERVER_SECRET;
      }
    }
  } catch(e) {}
  return config;
});
function finderDbHeaders(extra) {
  if (hasPrivilegedSupabaseKey()) return sbPrivilegedHeaders(extra);
  var key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_KEY;
  var h = Object.assign({"apikey": key, "x-finder-server": FINDER_SERVER_SECRET}, extra || {});
  if (!/^sb_(publishable|secret)_/i.test(String(key || ''))) h.Authorization = "Bearer " + key;
  return h;
}
function finderRpcHeaders(extra) {
  var key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_KEY;
  var h = Object.assign({"apikey": key, "Content-Type":"application/json"}, extra || {});
  if (!/^sb_(publishable|secret)_/i.test(String(key || ''))) h.Authorization = "Bearer " + key;
  return h;
}
async function finderRpc(name,payload){
  return axios.post(SUPABASE_URL+"/rest/v1/rpc/"+name,payload,{headers:finderRpcHeaders()});
}
console.log("[Supabase] URL:", SUPABASE_URL);
console.log("[Supabase] KEY tipo:", SUPABASE_KEY.startsWith("sb_publishable") ? "anon/publishable" : "service_role");
console.log("[Supabase] SERVICE KEY tipo:", SUPABASE_SERVICE_KEY_VAL.startsWith("sb_publishable") ? "anon/publishable (igual que KEY)" : "service_role ✅");
console.log("[Supabase] Env vars disponibles con SUPABASE:", Object.keys(process.env).filter(k=>k.includes("SUPABASE")));
// ── WEB PUSH SETUP ────────────────────────────────────────────────────────────
// Generate VAPID keys once: node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k)"
// Then set as env vars VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
var VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || "BAiEnD8bWwsFfBgwf4EIxJVLDJP2bQzE4xw_kLvwSGXyZmDnA0STk9SBlnGOI2sMG6Ij8-XFmbpAPPnA-UN2Nvk";
var VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "ZmDnA0STk9SBlnGOI2sMG6Ij8-XFmbpAPPnA-UN2Nvk";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:admin@luzia.app", VAPID_PUBLIC, VAPID_PRIVATE);
  console.log("Web Push configurado OK");
