<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#030817">
<meta name="robots" content="noindex">
<title>Hola Luz · Equipo</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--b0:#030817;--line:rgba(96,140,255,.18);--line2:rgba(169,185,214,.1);--t1:#2F6BFF;--cy:#27D7FF;--lz:#7A4DFF;--lz2:#B94CFF;--pk:#FF3D8B;--ok:#31E6A1;--warn:#FFBE4B;--bad:#FF5C7A;--tx:#F5F8FF;--tx2:#A9B9D6;--tx3:#6F86AD;
--glass:linear-gradient(160deg,rgba(17,33,84,.72),rgba(7,14,40,.88));--glow:0 0 0 1px rgba(122,120,255,.12),0 24px 60px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06);--ff:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;--ease:cubic-bezier(.2,.8,.2,1)}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#030817;color:var(--tx);font-family:var(--ff);-webkit-font-smoothing:antialiased}
body{min-height:100vh;min-height:100dvh;background:radial-gradient(900px 620px at 12% -8%,rgba(122,77,255,.34),transparent 60%),radial-gradient(800px 600px at 110% 20%,rgba(39,120,255,.22),transparent 60%),radial-gradient(700px 500px at 50% 120%,rgba(185,76,255,.14),transparent 60%),#030817;background-attachment:fixed}
button,input,select,textarea{font-family:inherit}
button{cursor:pointer}
.hide{display:none!important}
.orb{width:42px;height:42px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff 0,#dfe4ff 10%,#8c7bff 36%,#3b24b8 66%,#0d0f45 100%);box-shadow:0 0 24px rgba(122,77,255,.7),0 0 60px rgba(47,107,255,.25);flex:none}
.brand{display:flex;align-items:center;gap:12px}
.brand b{display:block;font-size:16px;letter-spacing:.1em;font-weight:800}
.brand small{display:block;font-size:12px;color:var(--tx2)}
.glass{background:var(--glass);border:1px solid var(--line);border-radius:24px;box-shadow:var(--glow);position:relative}
.glass.pad{padding:18px}
.btn{appearance:none;border:1px solid var(--line);background:rgba(18,36,82,.6);color:var(--tx);font:800 14px var(--ff);padding:14px 18px;border-radius:16px;min-height:52px;display:inline-flex;align-items:center;justify-content:center;gap:9px;transition:transform .12s var(--ease),filter .15s,box-shadow .2s;text-decoration:none}
.btn:active{transform:scale(.98)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.pri{border-color:rgba(140,120,255,.6);background:linear-gradient(135deg,#2F6BFF,#7A4DFF 60%,#9B4DFF);box-shadow:0 12px 30px rgba(91,77,255,.45),inset 0 1px 0 rgba(255,255,255,.25)}
.btn.pk{border-color:rgba(255,92,160,.6);background:linear-gradient(135deg,#FF3D8B,#FF5C7A);box-shadow:0 12px 30px rgba(255,61,139,.35),inset 0 1px 0 rgba(255,255,255,.22)}
.btn.ok{border-color:rgba(49,230,161,.5);background:linear-gradient(135deg,#0c8f67,#1fc48d);box-shadow:0 10px 26px rgba(49,230,161,.25)}
.btn.warn{border-color:rgba(255,190,75,.5);background:rgba(255,190,75,.14);color:#ffe0a3}
.btn.bad{border-color:rgba(255,92,122,.5);background:rgba(255,92,122,.12);color:#ffb6c4}
.btn.ghost{background:rgba(255,255,255,.02)}
.btn.sm{min-height:40px;padding:9px 13px;font-size:12.5px;border-radius:12px}
.btn.block{width:100%}
.btn:focus-visible,.in:focus-visible,.key:focus-visible,.pcard:focus-visible,.tab:focus-visible,.menu-row:focus-visible{outline:2px solid var(--cy);outline-offset:2px}
.in,.sel,.ta{width:100%;min-width:0;padding:13px 14px;border-radius:14px;border:1px solid var(--line);background:rgba(4,11,32,.8);color:#fff;font:600 16px var(--ff);min-height:50px}
.ta{min-height:96px;resize:vertical;line-height:1.45}
.in::placeholder,.ta::placeholder{color:#5b6f93}
label.f{display:block;margin-bottom:12px}
label.f>span{display:block;font-size:12px;font-weight:800;color:var(--tx2);margin-bottom:6px;letter-spacing:.03em}
.err{color:#ff9fb2;font-size:13px;min-height:18px;margin-top:8px}
.note{font-size:12.5px;color:var(--tx3);line-height:1.55}
.chip{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid var(--line);color:var(--tx2);background:rgba(18,36,82,.5);white-space:nowrap}
.chip.ok{color:#8ff7d2;border-color:rgba(49,230,161,.42);background:rgba(49,230,161,.1)}
.chip.warn{color:#ffd48a;border-color:rgba(255,190,75,.42);background:rgba(255,190,75,.1)}
.chip.bad{color:#ffabbd;border-color:rgba(255,92,122,.44);background:rgba(255,92,122,.1)}
.chip.lz{color:#dccbff;border-color:rgba(122,77,255,.5);background:rgba(122,77,255,.14)}
.chip i{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
.av{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:19px;color:#fff;background:linear-gradient(145deg,#2b3f9c,#5a2fb8);box-shadow:0 0 0 2px rgba(3,8,23,1),0 0 0 4px rgba(122,120,255,.45);overflow:hidden;flex:none}
.av img{width:100%;height:100%;object-fit:cover}
.toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;padding:12px 16px;border-radius:14px;background:rgba(8,16,44,.97);border:1px solid rgba(97,232,255,.3);font:700 14px var(--ff);max-width:calc(100vw - 28px);box-shadow:0 14px 40px rgba(0,0,0,.45)}
.center{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:18px}
.layer{position:fixed;inset:0;z-index:75;background:rgba(2,6,18,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:12px}
.sheet{width:min(560px,100%);max-height:92vh;overflow:auto;border-radius:26px;background:linear-gradient(165deg,rgba(18,34,86,.98),rgba(5,11,32,.99));border:1px solid rgba(122,120,255,.24);padding:22px;animation:up .24s var(--ease);box-shadow:0 30px 90px rgba(0,0,0,.6)}
@media(min-width:700px){.layer{align-items:center}}
.sheet h3{margin:0 0 4px;font-size:20px}
.xbtn{float:right;border:0;background:rgba(111,134,173,.18);color:#cfe0ff;width:40px;height:40px;border-radius:12px;font-size:17px}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes breathe{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.035);opacity:1}}
@keyframes sweep{0%{top:18%}50%{top:78%}100%{top:18%}}
/* ════ LUZ CHECK ════ */
.k-wrap{max-width:1320px;margin:0 auto;padding:20px 22px calc(22px + env(safe-area-inset-bottom));min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
.k-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.k-logo{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(47,107,255,.35),rgba(122,77,255,.35));border:1px solid rgba(97,232,255,.3);box-shadow:0 0 22px rgba(47,107,255,.35);flex:none}
.k-logo svg{width:24px;height:24px;stroke:#bfe9ff;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.k-title b{font-size:19px;letter-spacing:.06em;color:#8fd2ff;display:block}
.k-title small{font-size:12.5px;color:var(--tx2)}
.k-clock{text-align:right}
.k-clock b{display:block;font-size:32px;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.k-clock small{display:block;color:var(--tx2);font-size:12.5px}.k-clock small::first-letter{text-transform:uppercase}
.k-main{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(0,1.05fr);gap:20px;flex:1;align-items:stretch}
.k-stage{padding:26px 22px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.k-stage:before{content:"";position:absolute;inset:0;background:radial-gradient(420px 320px at 50% 42%,rgba(47,107,255,.22),transparent 70%);pointer-events:none}
.scan{position:relative;aspect-ratio:1;width:min(360px,70vw);display:grid;place-items:center;margin-bottom:18px}
.scan .r{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(62,140,255,.55);box-shadow:0 0 30px rgba(47,107,255,.35),inset 0 0 30px rgba(47,107,255,.2)}
.scan .r2{inset:6%;border:1.5px solid rgba(97,232,255,.35);box-shadow:none}
.scan .r3{inset:12%;border:2px dashed rgba(39,215,255,.45);animation:spin 24s linear infinite;box-shadow:none}
.scan .r4{inset:-4%;border:1px solid rgba(122,77,255,.3);box-shadow:none}
.scan .tick{position:absolute;inset:-2%;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 70%,rgba(39,215,255,.8) 80%,transparent 90%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:spin 4s linear infinite;opacity:.85}
.scan .core{position:relative;width:62%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:clamp(40px,6vw,64px);font-weight:800;background:radial-gradient(circle at 40% 30%,rgba(122,120,255,.55),rgba(21,30,90,.95) 70%);box-shadow:0 0 0 3px rgba(97,232,255,.35),0 0 50px rgba(91,77,255,.55),inset 0 0 40px rgba(39,215,255,.18);animation:breathe 4s ease-in-out infinite;overflow:hidden}
.scan .core .line{position:absolute;left:10%;right:10%;height:2px;background:linear-gradient(90deg,transparent,#61E8FF,transparent);box-shadow:0 0 14px #27D7FF;animation:sweep 2.6s ease-in-out infinite;opacity:0}
.scan[data-s="checking"] .core .line,.scan[data-s="camera"] .core .line{opacity:1}
.scan[data-s="checking"] .tick{animation-duration:1.2s}
.scan[data-s="done"] .r{border-color:rgba(49,230,161,.8);box-shadow:0 0 40px rgba(49,230,161,.45),inset 0 0 30px rgba(49,230,161,.2)}
.scan[data-s="done"] .core{box-shadow:0 0 0 4px rgba(49,230,161,.8),0 0 60px rgba(49,230,161,.5);color:#bfffe6}
.scan[data-s="done"] .tick,.scan[data-s="failed"] .tick{display:none}
.scan[data-s="failed"] .r{border-color:rgba(255,92,122,.7);box-shadow:0 0 30px rgba(255,92,122,.3)}
.scan[data-s="wait"] .r{border-color:rgba(255,190,75,.7)}
.k-state{text-align:center;position:relative}
.k-state b{display:block;font-size:19px;letter-spacing:.14em;font-weight:800}
.k-state small{display:block;color:var(--tx2);font-size:14px;margin-top:6px;line-height:1.45}
.k-state[data-s="done"] b{color:#7ff5cb}.k-state[data-s="failed"] b{color:#ff9fb2}.k-state[data-s="wait"] b{color:#ffd48a}.k-state[data-s="camera"] b,.k-state[data-s="checking"] b{color:#8fe4ff}
.k-bio{margin-top:18px;padding:12px 14px;border-radius:16px;border:1px solid var(--line2);background:rgba(8,18,48,.55);font-size:12.5px;color:var(--tx2);line-height:1.5;max-width:420px;position:relative}
.k-panel{padding:24px;display:flex;flex-direction:column;min-width:0}
.k-panel h2{margin:0 0 6px;font-size:26px;font-weight:800;letter-spacing:-.01em}
.k-panel>p{margin:0 0 16px;color:var(--tx2);font-size:15px}
.k-kicker{font-size:12px;letter-spacing:.2em;font-weight:800;color:#8fb9ff;margin-bottom:6px}
.search{margin-bottom:14px}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;overflow:auto;padding:4px;max-height:calc(100vh - 300px)}
.pcard{appearance:none;border:1px solid var(--line2);background:linear-gradient(170deg,rgba(24,44,104,.5),rgba(8,16,46,.7));color:var(--tx);border-radius:20px;padding:16px 10px 14px;text-align:center;min-height:164px;display:flex;flex-direction:column;align-items:center;gap:7px;transition:border-color .15s,transform .12s var(--ease),box-shadow .2s}
.pcard:hover{border-color:rgba(97,232,255,.5);box-shadow:0 0 24px rgba(47,107,255,.25)}
.pcard:active{transform:scale(.98)}
.pcard .av{width:62px;height:62px}
.pcard[data-st="ACTIVE"] .av{box-shadow:0 0 0 2px #030817,0 0 0 4px rgba(49,230,161,.8),0 0 18px rgba(49,230,161,.4)}
.pcard[data-st="ON_BREAK"] .av{box-shadow:0 0 0 2px #030817,0 0 0 4px rgba(255,190,75,.85)}
.pcard b{font-size:14.5px;line-height:1.2}
.pcard small{font-size:11.5px;color:var(--tx3)}
.acts{display:grid;gap:12px;margin:16px 0}
.acts .btn{min-height:68px;font-size:17px;letter-spacing:.08em}
.pinbox{display:flex;justify-content:center;gap:14px;margin:10px 0 16px}
.pinbox span{width:18px;height:18px;border-radius:50%;border:2px solid rgba(169,185,214,.45)}
.pinbox span.on{background:linear-gradient(135deg,var(--cy),var(--lz));border-color:transparent;box-shadow:0 0 14px rgba(39,215,255,.6)}
.keys{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:380px;margin:0 auto;width:100%}
.key{appearance:none;border:1px solid var(--line);background:linear-gradient(170deg,rgba(26,48,110,.6),rgba(10,20,56,.8));color:#fff;font:800 27px var(--ff);border-radius:20px;min-height:68px;font-variant-numeric:tabular-nums}
.key:active{background:rgba(47,107,255,.4)}
.key.sm{font-size:15px;color:var(--tx2)}
.v-head{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;letter-spacing:.12em;color:#7ff5cb}
.v-head .ck{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;border:2px solid #31E6A1;font-size:13px;box-shadow:0 0 14px rgba(49,230,161,.5)}
.v-hi{font-size:22px;font-weight:800;color:#8fd2ff;margin:6px 0 16px}
.v-card{display:grid;grid-template-columns:52px 1fr;gap:14px;align-items:center;padding:14px 16px;border-radius:18px;border:1px solid var(--line2);background:rgba(8,18,48,.6);margin-bottom:12px}
.v-ic{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:rgba(47,107,255,.18);border:1px solid rgba(97,232,255,.35);box-shadow:0 0 18px rgba(47,107,255,.35);flex:none}
.v-ic svg{width:22px;height:22px;stroke:#9fe3ff;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.done-big{font-size:20px;font-weight:800;letter-spacing:.04em}
.v-card small{display:block;color:var(--tx2);font-size:13px;margin-top:2px}.v-card small::first-letter{text-transform:uppercase}
.v-ok{text-align:center;margin:10px 0 14px}
.v-ok .big{width:64px;height:64px;border-radius:50%;margin:0 auto 10px;display:grid;place-items:center;border:2.5px solid #61E8FF;color:#61E8FF;font-size:30px;box-shadow:0 0 30px rgba(39,215,255,.45)}
.v-ok b{display:block;font-size:20px;color:#8fe4ff}
.v-ok small{color:var(--tx2)}
.banner{margin:0 0 14px;padding:12px 14px;border-radius:14px;font-size:14px;border:1px solid rgba(255,190,75,.4);background:rgba(255,190,75,.08);color:#ffe2a8;line-height:1.45}
.banner.info{border-color:rgba(97,232,255,.3);background:rgba(39,215,255,.07);color:#bff3ff}
.countdown{font-size:13px;color:var(--tx2);text-align:center;margin-top:10px;font-variant-numeric:tabular-nums}
.k-foot{margin-top:16px;text-align:center;font-size:12px;color:var(--tx3)}
#kLive{min-height:420px;border-radius:20px;overflow:hidden;background:#fff}
/* ════ MI TURNO ════ */
.m-wrap{max-width:560px;margin:0 auto;padding:16px 16px calc(104px + env(safe-area-inset-bottom))}
.m-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}
.m-top .me{appearance:none;border:0;background:none;padding:0}
.m-top .me .av{width:42px;height:42px;font-size:14px}
.hello{display:flex;align-items:center;gap:14px;margin:2px 0 14px}
.hello b{display:block;font-size:22px;letter-spacing:-.01em}
.hello small{color:var(--tx2);font-size:13.5px}
.ringcard{padding:18px}
.ringgrid{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;align-items:center;margin-top:14px}
.ringbox{position:relative;width:150px;height:150px}
.ringbox svg{width:150px;height:150px;transform:rotate(-90deg);filter:drop-shadow(0 0 10px rgba(39,215,255,.45))}
.ringbox .mid{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.ringbox .mid b{display:block;font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ringbox .mid small{font-size:12px;color:var(--tx2)}
.kv2 div{padding:9px 0;border-bottom:1px solid var(--line2)}
.kv2 div:last-child{border-bottom:0}
.kv2 small{display:block;font-size:12px;color:var(--tx2)}
.kv2 b{font-size:15.5px}
.btn-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.hint{display:grid;grid-template-columns:44px 1fr;gap:12px;align-items:center;margin-top:16px;padding:12px 14px;border-radius:16px;border:1px solid rgba(97,232,255,.22);background:rgba(39,215,255,.06)}
.hint .v-ic{width:42px;height:42px}
.hint b{font-size:14px}.hint small{display:block;font-size:12.5px;color:var(--tx2);margin-top:2px;line-height:1.45}
.sec-t{font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--tx2);margin:22px 4px 10px;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;gap:8px}
.sec-t button{font-size:12.5px;letter-spacing:0;text-transform:none;color:#8fb9ff;background:none;border:0;font-weight:800;padding:4px}
.luzid{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:14px;align-items:center;padding:16px;overflow:hidden}
.luzid:after{content:"";position:absolute;inset:0;border-radius:24px;background:radial-gradient(260px 120px at 0% 50%,rgba(122,77,255,.25),transparent 70%);pointer-events:none}
.face-ic{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(47,107,255,.4),rgba(122,77,255,.45));border:1px solid rgba(97,232,255,.35);box-shadow:0 0 22px rgba(91,77,255,.45);position:relative;z-index:1}
.face-ic svg{width:30px;height:30px;stroke:#d6f4ff;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.luzid b{display:block;font-size:15.5px;position:relative;z-index:1}.luzid small{display:block;font-size:12.5px;color:var(--tx2);position:relative;z-index:1;line-height:1.4}
.luzid .btn,.luzid .chip{position:relative;z-index:1}
.bars{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;align-items:end;height:110px}
.bars div{display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.bars i{display:block;width:100%;max-width:26px;border-radius:8px 8px 4px 4px;background:linear-gradient(180deg,#61E8FF,#7A4DFF);box-shadow:0 0 12px rgba(91,77,255,.4);min-height:4px}
.bars i.zero{background:rgba(111,134,173,.2);box-shadow:none}
.bars span{font-size:11px;color:var(--tx3);font-weight:700}
.bars .hoy span{color:#8fe4ff}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--line2)}
.row:first-child{border-top:0}
.row b{font-size:14.5px}.row small{display:block;font-size:12.5px;color:var(--tx3);margin-top:2px}
.row>div{min-width:0}.row .val{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.seg{display:flex;gap:6px;padding:5px;border-radius:14px;background:rgba(6,16,44,.85);border:1px solid var(--line2);margin-bottom:14px}
.seg button{flex:1;appearance:none;border:0;background:none;color:var(--tx2);font:800 13.5px var(--ff);padding:11px;border-radius:10px}
.seg button.on{background:linear-gradient(135deg,#2F6BFF,#7A4DFF);color:#fff;box-shadow:0 6px 18px rgba(91,77,255,.4)}
.total{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px;border-radius:18px;background:linear-gradient(135deg,rgba(47,107,255,.2),rgba(122,77,255,.22));border:1px solid rgba(140,120,255,.45);margin-top:10px}
.total strong{display:block;font-size:26px;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.total small{display:block;font-size:12px;color:var(--tx2)}
.day{display:grid;grid-template-columns:54px minmax(0,1fr);gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line2)}
.day:first-child{border-top:0}
.dbadge{width:54px;height:58px;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(18,36,82,.6);border:1px solid var(--line2)}
.dbadge small{font-size:10.5px;letter-spacing:.1em;color:var(--tx2);font-weight:800;text-transform:uppercase}
.dbadge b{font-size:19px}
.day.hoy .dbadge{background:linear-gradient(145deg,#2F6BFF,#7A4DFF);border-color:transparent;box-shadow:0 0 18px rgba(91,77,255,.45)}
.day.hoy .dbadge small{color:#e8ecff}
.shift{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:9px 12px;border-radius:12px;background:rgba(47,107,255,.14);border:1px solid rgba(97,140,255,.3);font-weight:800;font-size:14px;margin:3px 0}
.shift small{font-size:11.5px;color:#b9cdfa;font-weight:700}
.libre{color:var(--tx3);font-size:13.5px}
.avail{display:grid;grid-template-columns:40px 26px minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:center;margin-bottom:8px}
.avail .in{min-height:44px;padding:8px 6px;font-size:14px}
.avail input[type=checkbox]{width:22px;height:22px;accent-color:#7A4DFF}
.menu-row{appearance:none;width:100%;display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 4px;border:0;border-top:1px solid var(--line2);background:none;color:var(--tx);text-align:left;font:inherit}
.menu-row:first-child{border-top:0}
.menu-row .v-ic{width:40px;height:40px}
.menu-row b{font-size:14.5px}.menu-row small{display:block;font-size:12.5px;color:var(--tx3)}
.nav{position:fixed;left:0;right:0;bottom:0;background:rgba(4,9,28,.92);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid var(--line);display:flex;justify-content:space-around;padding:8px 6px calc(8px + env(safe-area-inset-bottom));z-index:30}
.tab{appearance:none;border:0;background:none;color:var(--tx3);font:800 11px var(--ff);display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;border-radius:14px;min-width:0;flex:1;max-width:96px}
.tab.on{color:#fff;background:linear-gradient(160deg,rgba(47,107,255,.35),rgba(122,77,255,.3));box-shadow:0 0 16px rgba(91,77,255,.35)}
.tab svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.doc{white-space:pre-wrap;font-size:14px;line-height:1.6;color:#d6e2f7;background:rgba(4,11,32,.72);border:1px solid var(--line2);padding:14px;border-radius:14px;max-height:46vh;overflow:auto}
.bigpin{font-size:44px;font-weight:800;letter-spacing:.24em;text-align:center;padding:16px;border-radius:18px;background:rgba(4,11,32,.8);border:1px solid rgba(122,77,255,.45);margin:10px 0;font-variant-numeric:tabular-nums}
/* LUZ ID (pantalla completa) */
.fs{position:fixed;inset:0;z-index:70;overflow:auto;background:radial-gradient(700px 500px at 50% 0%,rgba(122,77,255,.35),transparent 70%),radial-gradient(600px 500px at 50% 110%,rgba(39,120,255,.25),transparent 70%),#030817;animation:up .25s var(--ease)}
.fs-in{max-width:520px;margin:0 auto;padding:18px 18px calc(28px + env(safe-area-inset-bottom));min-height:100%;display:flex;flex-direction:column}
.fs-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.steps{display:flex;gap:6px}.steps i{width:28px;height:5px;border-radius:5px;background:rgba(111,134,173,.3)}.steps i.on{background:linear-gradient(90deg,#27D7FF,#7A4DFF);box-shadow:0 0 10px rgba(39,215,255,.5)}
.hero{position:relative;width:230px;height:230px;margin:18px auto 20px;flex:none}
.hero .ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(62,140,255,.55);box-shadow:0 0 40px rgba(47,107,255,.4),inset 0 0 30px rgba(47,107,255,.25)}
.hero .ring.b{inset:9%;border:2px dashed rgba(39,215,255,.5);animation:spin 20s linear infinite;box-shadow:none}
.hero .ring.c{inset:-6%;border:1px solid rgba(122,77,255,.35);box-shadow:none}
.hero .face{position:absolute;inset:20%;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 40% 30%,rgba(122,120,255,.55),rgba(21,30,90,.95) 70%);box-shadow:0 0 50px rgba(91,77,255,.6);animation:breathe 4s ease-in-out infinite;overflow:hidden}
.hero .face svg{width:62%;height:62%;stroke:#cfefff;fill:none;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;opacity:.95}
.hero .face .line{position:absolute;left:12%;right:12%;height:2px;background:linear-gradient(90deg,transparent,#61E8FF,transparent);box-shadow:0 0 14px #27D7FF;animation:sweep 2.8s ease-in-out infinite}
.hero.ok .ring{border-color:rgba(49,230,161,.85);box-shadow:0 0 50px rgba(49,230,161,.5)}
.hero.ok .face{box-shadow:0 0 0 4px rgba(49,230,161,.8),0 0 60px rgba(49,230,161,.5)}
.fs h2{font-size:28px;line-height:1.15;margin:0 0 8px;text-align:center;letter-spacing:-.02em}
.fs h2 em{font-style:normal;background:linear-gradient(90deg,#61E8FF,#B94CFF);-webkit-background-clip:text;background-clip:text;color:transparent}
.fs .lead{text-align:center;color:var(--tx2);font-size:15px;line-height:1.5;margin:0 0 18px}
.benef{display:grid;gap:10px;margin-bottom:20px}
.benef>div{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;align-items:center;padding:12px 14px;border-radius:16px;background:rgba(10,20,56,.6);border:1px solid var(--line2)}
.benef .v-ic{width:38px;height:38px}
.benef b{display:block;font-size:14px}.benef small{display:block;font-size:12.5px;color:var(--tx2)}
.fs .grow{flex:1}
#mLive{min-height:460px;border-radius:22px;overflow:hidden;background:#fff}
@media(max-width:900px){.k-main{grid-template-columns:1fr}.scan{width:min(170px,46vw);margin-bottom:12px}.k-stage{padding:16px}.k-bio{margin-top:12px;font-size:12px}.k-clock{text-align:left}.k-state b{font-size:16px}.k-wrap{padding:14px 14px calc(70px + env(safe-area-inset-bottom))}.pgrid{max-height:none}.k-clock b{font-size:24px}}
@media(max-width:380px){.ringgrid{grid-template-columns:1fr}.ringbox{margin:0 auto}}@media(max-width:440px){.luzid{grid-template-columns:58px minmax(0,1fr)}.luzid .btn{grid-column:1/-1;width:100%}.luzid .chip{grid-column:2;justify-self:start}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div id="app" aria-live="polite"></div>
<script>
(function(){
'use strict';
var D=document,W=window,$=function(id){return D.getElementById(id)};
var Q=new URLSearchParams(location.search),RID=(Q.get('r')||'').toLowerCase(),MODO=Q.get('modo')||'',EMBED=Q.get('embed')==='1';
var S={off:0,tz:'America/Bogota',rest:null,online:true};
var SV={clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',cal:'<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',face:'<svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 10v1M15 10v1M12 10v3.5h-1M9.5 16c1.5 1.2 3.5 1.2 5 0"/></svg>',facebig:'<svg viewBox="0 0 64 64"><path d="M20 26c0-8 5-14 12-14s12 6 12 14v6c0 9-5.5 16-12 16s-12-7-12-16z"/><path d="M26 30h.01M38 30h.01M29 40c2 1.6 4 1.6 6 0M32 30v6h-2"/><path d="M8 18V12a4 4 0 0 1 4-4h6M46 8h6a4 4 0 0 1 4 4v6M56 46v6a4 4 0 0 1-4 4h-6M18 56h-6a4 4 0 0 1-4-4v-6"/></svg>',shield:'<svg viewBox="0 0 24 24"><path d="M12 3.5 5 6.5v5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9v-5z"/><path d="m9 12 2 2 4-4"/></svg>',nophoto:'<svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="17" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.2"/><path d="M4 4l16 16"/></svg>',undo:'<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',sun:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',person:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.3-6 7-6s6.2 2 7 6"/></svg>',phone:'<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',doc:'<svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5"/></svg>',lock:'<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',out:'<svg viewBox="0 0 24 24"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/></svg>',chev:'<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#6F86AD;fill:none;stroke-width:2"><path d="m9 6 6 6-6 6"/></svg>',money:'<svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/></svg>',bars:'<svg viewBox="0 0 24 24"><path d="M5 19V9M10 19V5M15 19v-7M20 19v-4"/></svg>',dots:'<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>'};
function E(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
function now(){return Date.now()+S.off}
function tzp(d){var o={};new Intl.DateTimeFormat('en-CA',{timeZone:S.tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(d)).forEach(function(p){o[p.type]=p.value});return o}
function dayKey(d){var o=tzp(d);return o.year+'-'+o.month+'-'+o.day}
function hm12(d){if(!d)return '—';return new Intl.DateTimeFormat('es-CO',{timeZone:S.tz,hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(d)).replace(/\s?a\.\s?m\./i,' AM').replace(/\s?p\.\s?m\./i,' PM')}
function dia(d){return new Intl.DateTimeFormat('es-CO',{timeZone:S.tz,weekday:'long',day:'numeric',month:'long'}).format(new Date(d))}
function dm(k){return new Intl.DateTimeFormat('es-CO',{timeZone:'UTC',day:'numeric',month:'short'}).format(new Date(k+'T12:00:00Z')).replace('.','')}
function diaC(d){var t=new Intl.DateTimeFormat('es-CO',{timeZone:S.tz,weekday:'short',day:'numeric',month:'short'}).format(new Date(d)).replace(/\./g,'');return t.charAt(0).toUpperCase()+t.slice(1)}
function fmtH(m){m=Math.max(0,Math.round(m||0));var h=Math.floor(m/60),r=m%60;return h?(r?h+'h '+String(r).padStart(2,'0')+'m':h+'h'):r+'m'}
function ini(n){return String(n||'?').trim().split(/\s+/).slice(0,2).map(function(x){return x.charAt(0)}).join('').toUpperCase()}
function av(p){return '<span class="av" aria-hidden="true">'+(p&&p.foto_url?'<img src="'+E(p.foto_url)+'" alt="">':E(ini(p&&p.nombre)))+'</span>'}
function uuid(){try{return crypto.randomUUID()}catch(e){return 'k'+Date.now()+Math.random().toString(36).slice(2)}}
function money(n,m){if(n==null)return '—';try{return new Intl.NumberFormat(m==='USD'?'en-US':'es-CO',{style:'currency',currency:m||'COP',maximumFractionDigits:m==='USD'?2:0}).format(n)}catch(e){return '$'+Math.round(n)}}
function toast(m){var t=D.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;D.body.appendChild(t);setTimeout(function(){t.remove()},3400)}
async function call(method,path,body,headers){
  var r,j={};
  try{r=await fetch(path,{method:method,headers:Object.assign({'Content-Type':'application/json'},headers||{}),body:body?JSON.stringify(body):undefined,cache:'no-store'})}
  catch(e){S.online=false;var ne=new Error('Sin conexión. No se registró nada: intenta de nuevo.');ne.code='offline';throw ne}
  S.online=true;try{j=await r.json()}catch(e){}
  if(j&&j.servidor_at)S.off=new Date(j.servidor_at).getTime()-Date.now();
  if(!r.ok){var er=new Error(j.error||('Error '+r.status));er.code=j.code;er.data=j;er.status=r.status;throw er}
  return j;
}
function layer(html){var l=D.createElement('div');l.className='layer';l.setAttribute('role','dialog');l.setAttribute('aria-modal','true');l.innerHTML='<div class="sheet"><button class="xbtn" type="button" aria-label="Cerrar">✕</button>'+html+'</div>';D.body.appendChild(l);var close=function(){l.remove()};l.querySelector('.xbtn').onclick=close;l.addEventListener('mousedown',function(e){if(e.target===l)close()});setTimeout(function(){var f=l.querySelector('input,textarea,button:not(.xbtn)');if(f)f.focus()},60);return {el:l.querySelector('.sheet'),close:close}}
function diagLiv(origen,er){try{fetch('/api/equipo/liveness/diagnostico',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origen:origen,estado:er&&er.estado,mensaje:er&&er.mensaje,navegador:navigator.userAgent})})}catch(e){}}
function loadLiveness(){return new Promise(function(ok,no){if(W.LuzLiveness)return ok();var sc=D.createElement('script');sc.src='/equipo-liveness.js';sc.onload=function(){W.LuzLiveness?ok():no(new Error('El componente de verificación no está instalado.'))};sc.onerror=function(){no(new Error('No se pudo cargar el componente de verificación.'))};D.head.appendChild(sc)})}
var ACC={entrada:['INICIAR TURNO','pri','ENTRADA'],descanso_inicio:['INICIAR DESCANSO','warn','DESCANSO'],descanso_fin:['TERMINAR DESCANSO','ok','REGRESO'],salida:['FINALIZAR TURNO','pk','SALIDA']};
var ROL={cocina:'Cocina',salon:'Salón',caja:'Caja',domicilio:'Domicilio',manager:'Manager',otro:'Equipo'};
function saludo(){var h=Number(tzp(now()).hour);return h<5?'Buenas noches':h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'}

/* ═══ Arranque ═══ */
async function boot(){
  var app=$('app');
  if(!/^[0-9a-f-]{36}$/.test(RID)){app.innerHTML='<div class="center"><div class="glass pad" style="max-width:420px;text-align:center"><div class="brand" style="justify-content:center;margin-bottom:12px"><span class="orb"></span><div><b>HOLA LUZ</b><small>Equipo</small></div></div><p>Abre el enlace que te dio tu restaurante.</p></div></div>';return}
  try{var p=await call('GET','/api/equipo/publico/'+RID);S.rest=p.restaurante}catch(e){app.innerHTML='<div class="center"><div class="glass pad" style="max-width:420px;text-align:center"><b>'+(e.code==='offline'?'Sin conexión':'No disponible')+'</b><p class="note">'+E(e.message)+'</p><button class="btn" onclick="location.reload()">Reintentar</button></div></div>';return}
  if(ls('hl_wf_dev_'+RID))return kiosk();
  if(MODO==='check')return kioskActivar();
  return portal();
}

/* ═══════════════ LUZ CHECK (tablet / INICIAR DÍA del panel) ═══════════════ */
var K={data:null,sel:null,accion:null,pin:'',key:null,acc:null,idle:null,poll:null,altPoll:null,state:'ready',temp:false,live:null};
function devTok(){return ls('hl_wf_dev_'+RID)}
function kHead(){return '<div class="k-head"><div class="brand"><span class="k-logo">'+SV.person+'</span><div class="k-title"><b>LUZ CHECK</b><small>Inicia tu día de trabajo · '+E(S.rest&&S.rest.nombre||'')+'</small></div></div><div class="k-clock"><b id="kClock">—</b><small id="kDate"></small></div></div>'}
function kioskActivar(){
  $('app').innerHTML='<div class="center"><div class="glass pad" style="max-width:470px;width:100%;padding:26px"><div class="brand" style="margin-bottom:16px"><span class="k-logo">'+SV.person+'</span><div class="k-title"><b>ACTIVAR LUZ CHECK</b><small>'+E(S.rest.nombre)+'</small></div></div><p class="note" style="font-size:14px">Esta tablet quedará en el restaurante para que tu equipo inicie su día, tome descansos y termine su turno. Solo la administración la activa, con el PIN del restaurante.</p><label class="f"><span>Nombre de este dispositivo</span><input class="in" id="aN" value="Tablet entrada" maxlength="60"></label><label class="f"><span>PIN del restaurante</span><input class="in" id="aP" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label><button class="btn pri block" id="aGo">Activar LUZ CHECK ✦</button><div class="err" id="aE" role="alert"></div><p class="note" style="margin-top:14px">Sin GPS. Sin fotos guardadas. La hora la pone el servidor.</p><button class="btn ghost block sm" id="aBack">Soy del equipo: ir a MI TURNO</button></div></div>';
  $('aBack').onclick=function(){history.replaceState(null,'','?r='+RID);portal()};
  $('aGo').onclick=async function(){var b=this;b.disabled=true;try{var r=await call('POST','/api/equipo/kiosko/activar',{restaurante_id:RID,pin:$('aP').value.trim(),nombre:$('aN').value.trim()});ls('hl_wf_dev_'+RID,r.token);history.replaceState(null,'','?r='+RID);kiosk()}catch(e){$('aE').textContent=e.message;b.disabled=false}};
}
async function kLoad(){var d=await call('GET','/api/equipo/kiosko/estado',null,{'x-wf-device':devTok()});K.data=d;S.tz=d.zona_horaria||S.tz;return d}
async function kiosk(){
  $('app').innerHTML='<div class="k-wrap">'+kHead()+'<div id="kBan"></div><div class="k-main"><section class="glass k-stage"><div class="scan" id="kScan" data-s="ready"><div class="r r4"></div><div class="r"></div><div class="r r2"></div><div class="r r3"></div><div class="tick"></div><div class="core" id="kFace"><span id="kFaceT">✦</span><span class="line"></span></div></div><div class="k-state" id="kState" data-s="ready"><b>LISTO</b><small>Toca tu nombre para empezar</small></div><div class="k-bio" id="kBio"></div></section><section class="glass k-panel" id="kPanel"></section></div><div class="k-foot">Sin GPS · Sin fotos guardadas · La hora la pone el servidor'+(EMBED?'':' · <button class="btn ghost sm" id="kOut" style="min-height:30px;padding:4px 10px">Administrar dispositivo</button>')+'</div></div>';
  var ko=$('kOut');if(ko)ko.onclick=kSalir;
  clock();setInterval(clock,1000);
  D.addEventListener('pointerdown',kTouch,true);D.addEventListener('keydown',kKey);
  try{await kLoad()}catch(e){if(e.status===401){ls('hl_wf_dev_'+RID,null);return kioskActivar()}kBanner(e.message)}
  kReady();
  clearInterval(K.poll);K.poll=setInterval(function(){if(K.state==='ready'&&!D.hidden)kLoad().then(function(){if(K.state==='ready')kReady(true)}).catch(function(e){kBanner(e.message)})},30000);
}
function clock(){var c=$('kClock');if(!c)return;c.textContent=hm12(now());$('kDate').textContent=dia(now())}
function kBanner(m){var b=$('kBan');if(b)b.innerHTML=m?'<div class="banner" role="alert">'+E(m)+'</div>':''}
function kTouch(){clearTimeout(K.idle);if(K.state!=='ready'&&K.state!=='wait'&&K.state!=='camera')K.idle=setTimeout(kReset,45000)}
function kVis(s,title,sub,face){var sc=$('kScan'),st=$('kState');if(!sc)return;K.state=s;if(innerWidth<900){var kp=$('kPanel');if(kp&&s!=='ready')setTimeout(function(){kp.scrollIntoView({block:'start',behavior:'smooth'})},30);else if(s==='ready')scrollTo(0,0)}sc.dataset.s=s;st.dataset.s=s;st.innerHTML='<b>'+E(title)+'</b>'+(sub?'<small>'+E(sub)+'</small>':'');$('kFaceT').textContent=face||'✦'}
function kReset(){kUnmount();clearInterval(K.altPoll);K.sel=null;K.accion=null;K.pin='';K.key=null;K.acc=null;K.temp=false;kLoad().catch(function(){}).then(function(){kReady()})}
function kReady(soft){
  var d=K.data;if(!d)return;var b=d.biometria||{};kBanner(S.online?'':'Sin conexión con el servidor.');
  $('kBio').innerHTML=b.configurado?'<b>Reconocimiento facial activo ✦</b><br>Si no tienes LUZ ID o la cámara falla, marca con tu PIN.':'<b>Reconocimiento facial no configurado.</b><br>Marca con tu PIN personal de trabajo. Si no puedes, pide verificación alternativa a tu supervisor.';
  if(!soft)kVis('ready','LISTO','Toca tu nombre para empezar');
  var q=(($('kQ')||{}).value||'');
  $('kPanel').innerHTML='<div class="k-kicker">INICIAR DÍA ✦</div><h2>'+E(saludo())+'. ¿Quién eres?</h2><p>Toca tu nombre para iniciar tu turno, tomar un descanso o terminar tu día.</p>'+(d.personas.length>8?'<input class="in search" id="kQ" placeholder="Busca tu nombre" aria-label="Buscar" value="'+E(q)+'">':'')+'<div class="pgrid" id="kGrid"></div>';
  var draw=function(){var f=(($('kQ')||{}).value||'').toLowerCase();$('kGrid').innerHTML=d.personas.filter(function(p){return !f||p.nombre.toLowerCase().indexOf(f)!==-1}).map(function(p){var s=p.sesion,c=s?(s.estado==='ON_BREAK'?'<span class="chip warn"><i></i>Descanso</span>':'<span class="chip ok"><i></i>En turno</span>'):'<span class="chip">Fuera</span>';return '<button class="pcard" type="button" data-id="'+p.id+'" data-st="'+(s?s.estado:'OUT')+'">'+av(p)+'<b>'+E(p.nombre)+'</b>'+c+(s?'<small>desde '+hm12(s.estado==='ON_BREAK'?s.descanso_inicio_at:s.entrada_at)+'</small>':'<small>'+E(ROL[p.rol]||'')+(p.luz_id?' · LUZ ID ✦':'')+'</small>')+'</button>'}).join('')||'<p class="note">Nadie coincide.</p>';$('kGrid').querySelectorAll('.pcard').forEach(function(c){c.onclick=function(){kPerson(c.dataset.id)}})};
  draw();var qi=$('kQ');if(qi){qi.oninput=draw}
  if(!d.personas.length)$('kGrid').innerHTML='<p class="note">Aún no hay personas registradas. La administración las agrega en el panel: Equipo → Personal.</p>';
}
function kPerson(id){
  var p=K.data.personas.filter(function(x){return x.id===id})[0];if(!p)return;K.sel=p;kTouch();
  var s=p.sesion,acts=!s?['entrada']:s.estado==='ACTIVE'?['descanso_inicio','salida']:['descanso_fin','salida'];
  kVis('person',p.nombre.toUpperCase(),s?(s.estado==='ON_BREAK'?'En descanso desde '+hm12(s.descanso_inicio_at):'En turno desde '+hm12(s.entrada_at)):'Fuera de turno',ini(p.nombre));
  var faceOk=!!(K.data.biometria&&K.data.biometria.configurado&&p.luz_id);
  $('kPanel').innerHTML='<div class="k-kicker">'+(faceOk?'VERIFICACIÓN FACIAL ✦':'VERIFICACIÓN CON PIN')+'</div><h2>Hola, '+E(p.nombre.split(' ')[0])+'</h2><p>¿Qué quieres registrar?</p><div class="acts">'+acts.map(function(a){return '<button class="btn '+ACC[a][1]+'" type="button" data-a="'+a+'">'+ACC[a][0]+'</button>'}).join('')+'</div>'+(p.pin_bloqueado||(!p.tiene_pin&&!faceOk)?'<div class="banner">'+(p.pin_bloqueado?'Tu PIN está bloqueado por intentos.':'Aún no has creado tu PIN de trabajo.')+' Usa la verificación alternativa.</div>':'')+'<button class="btn ghost block" type="button" id="kAlt">No puedo verificarme · Verificación alternativa</button><button class="btn ghost block" type="button" id="kBack" style="margin-top:10px">← No soy yo</button>';
  $('kPanel').querySelectorAll('[data-a]').forEach(function(b){b.onclick=function(){K.accion=b.dataset.a;K.key=uuid();K.temp=false;if(faceOk)kFace();else kPin()}});
  $('kAlt').onclick=function(){kAltPedir(p.pin_bloqueado?'pin_bloqueado':!p.tiene_pin?'sin_pin':'olvide_pin')};$('kBack').onclick=kReset;
}
function kPin(msg){
  var p=K.sel;K.pin='';
  kVis('pin',ACC[K.accion][2],K.temp?'Escribe el PIN temporal que te dijo tu supervisor':'Escribe tu PIN personal',ini(p.nombre));
  $('kPanel').innerHTML='<div class="k-kicker">'+E(ACC[K.accion][0])+'</div><h2>'+(K.temp?'PIN temporal':'Tu PIN de trabajo')+'</h2><p>'+E(p.nombre)+'</p><div class="pinbox" id="kDots" aria-label="PIN" aria-live="polite"></div><div class="err" id="kErr" role="alert" style="text-align:center">'+E(msg||'')+'</div><div class="keys">'+[1,2,3,4,5,6,7,8,9].map(function(n){return '<button class="key" type="button" data-k="'+n+'">'+n+'</button>'}).join('')+'<button class="key sm" type="button" data-k="back" aria-label="Borrar">Borrar</button><button class="key" type="button" data-k="0">0</button><button class="key sm" type="button" data-k="ok" style="color:#fff;background:linear-gradient(135deg,#2F6BFF,#7A4DFF)">OK</button></div>'+(K.temp&&K.accExp?'<div class="countdown" id="kCd"></div>':'')+'<button class="btn ghost block" type="button" id="kBack" style="margin-top:16px">Cancelar</button>';
  var dots=function(){var n=Math.max(K.temp?6:4,K.pin.length);$('kDots').innerHTML=Array.from({length:n}).map(function(_,i){return '<span class="'+(i<K.pin.length?'on':'')+'"></span>'}).join('')};dots();
  $('kPanel').querySelectorAll('[data-k]').forEach(function(b){b.onclick=function(){var k=b.dataset.k;if(k==='back')K.pin=K.pin.slice(0,-1);else if(k==='ok')return kEnviar();else if(K.pin.length<6)K.pin+=k;dots();if(K.temp&&K.pin.length===6)kEnviar()}});
  K.dots=dots;$('kBack').onclick=kReset;
  if(K.temp&&K.accExp){clearInterval(K.cd);K.cd=setInterval(function(){var el=$('kCd');if(!el){clearInterval(K.cd);return}var ms=K.accExp-now();el.textContent=ms>0?'Vence en '+Math.floor(ms/60000)+':'+String(Math.floor(ms%60000/1000)).padStart(2,'0'):'Vencido: pide uno nuevo'},500)}
}
/* Reconocimiento facial: solo con proveedor configurado y LUZ ID. Cada estado visual es un estado técnico real. */
async function kFace(){
  var p=K.sel;clearTimeout(K.idle);
  kVis('camera','IDENTIFICANDO…','Mira la cámara y mantén tu rostro dentro del óvalo',ini(p.nombre));
  $('kPanel').innerHTML='<div class="k-kicker">'+E(ACC[K.accion][0])+' · VERIFICACIÓN FACIAL ✦</div><h2>'+E(p.nombre.split(' ')[0])+', mira la cámara</h2><p>Luz verifica que seas tú y que estés aquí en persona. No guardamos fotos.</p><div id="kLive"></div><div class="err" id="kErr" role="alert"></div><button class="btn block" type="button" id="kUsePin" style="margin-top:12px">Usar mi PIN</button><button class="btn ghost block" type="button" id="kBack" style="margin-top:8px">Cancelar</button>';
  $('kUsePin').onclick=function(){kUnmount();K.key=uuid();kPin()};$('kBack').onclick=function(){kUnmount();kReset()};
  var ses;
  try{await loadLiveness();ses=await call('POST','/api/equipo/kiosko/liveness',{empleado_id:p.id},{'x-wf-device':devTok()})}
  catch(e){return kFallback(e.message)}
  K.live=W.LuzLiveness.mount($('kLive'),{sessionId:ses.session_id,region:ses.region,credenciales:ses.credenciales,sinPantallaInicio:true,
    onComplete:function(){kUnmount();kFaceEnviar(ses.session_id)},
    onCancel:function(){kUnmount();kReset()},
    onError:function(er){diagLiv('luz_check',er);kUnmount();kFallback(er&&er.estado==='CAMERA_ACCESS_ERROR'?'No hay permiso para la cámara.':'La verificación facial no se pudo completar'+(er&&er.estado?' ('+er.estado+')':'')+'.'+(er&&er.mensaje?' Detalle: '+String(er.mensaje).slice(0,160):''))}});
}
function kUnmount(){try{K.live&&K.live.unmount()}catch(e){}K.live=null}
function kFallback(msg){K.key=uuid();kPin(msg+' Marca con tu PIN personal.');var st=$('kState');if(st){st.dataset.s='failed';st.innerHTML='<b>USA TU PIN</b><small>'+E(msg)+'</small>'}}
async function kFaceEnviar(sid){
  var p=K.sel;kVis('checking','VERIFICANDO…','Comparando con tu LUZ ID',ini(p.nombre));
  try{var r=await call('POST','/api/equipo/kiosko/fichar',{empleado_id:p.id,accion:K.accion,metodo:'face',liveness_session_id:sid,client_key:K.key},{'x-wf-device':devTok()});kDone(r)}
  catch(e){var d=e.data||{};if(e.code==='offline')return kFallback('Sin conexión. No se registró nada.');kVis('failed','NO VERIFICADO',e.message,ini(p.nombre));
    $('kPanel').innerHTML='<div class="k-kicker">VERIFICACIÓN FACIAL</div><h2>No pudimos verificar tu identidad</h2><div class="banner" role="alert">'+E(e.message)+(d.fallos?' Intento '+d.fallos+' de '+(K.data.pin_temporal.fallos_para_alternativa||3)+'.':'')+'</div><div class="acts"><button class="btn pri" type="button" id="kRe">Intentar de nuevo</button><button class="btn" type="button" id="kUsePin">Usar mi PIN</button>'+(d.sugerir_alternativa?'<button class="btn warn" type="button" id="kAlt">SOLICITAR VERIFICACIÓN ALTERNATIVA</button>':'')+'</div><button class="btn ghost block" type="button" id="kBack">Volver al inicio</button>';
    $('kRe').onclick=function(){K.key=uuid();kFace()};$('kUsePin').onclick=function(){K.key=uuid();kPin()};$('kBack').onclick=kReset;var a=$('kAlt');if(a)a.onclick=function(){kAltPedir('rostro_no_reconocido')}}
}
function kKey(e){if(K.state!=='pin')return;if(/^[0-9]$/.test(e.key)&&K.pin.length<6){K.pin+=e.key;K.dots&&K.dots()}else if(e.key==='Backspace'){K.pin=K.pin.slice(0,-1);K.dots&&K.dots()}else if(e.key==='Enter')kEnviar()}
async function kEnviar(){
  if(K.state!=='pin')return;var p=K.sel;if(K.pin.length<4){$('kErr').textContent='El PIN tiene al menos 4 números.';return}
  kVis('checking','VERIFICANDO…','Comprobando con el servidor',ini(p.nombre));
  var body={empleado_id:p.id,accion:K.accion,metodo:K.temp?'pin_temporal':'pin',pin:K.pin,client_key:K.key};if(K.temp)body.acceso_id=K.acc;
  try{var r=await call('POST','/api/equipo/kiosko/fichar',body,{'x-wf-device':devTok()});kDone(r)}
  catch(e){
    // Si fue la red, el mismo client_key evita duplicar al reintentar.
    var d=e.data||{};K.pin='';
    if(e.code==='offline'){kVis('failed','SIN CONEXIÓN','No se registró nada. Intenta de nuevo.',ini(p.nombre));return kPin('Sin conexión. No se registró nada.')}
    if(['pin_bloqueado','sin_pin','pin_temporal_bloqueado','pin_expirado'].indexOf(e.code)>=0||d.sugerir_alternativa){kVis('failed','NO VERIFICADO',e.message,ini(p.nombre));return kFail(e.message,true)}
    if(e.code==='pin_incorrecto'){K.key=uuid();kVis('failed','PIN INCORRECTO',d.intentos_restantes!=null?'Te quedan '+d.intentos_restantes+' intentos':'',ini(p.nombre));return kPin('PIN incorrecto.'+(d.intentos_restantes!=null?' Te quedan '+d.intentos_restantes+'.':''))}
    kVis('failed','NO SE REGISTRÓ',e.message,ini(p.nombre));kFail(e.message,false);
  }
}
function kFail(msg,alt){$('kPanel').innerHTML='<div class="k-kicker">NO SE REGISTRÓ</div><h2>Algo no salió bien</h2><div class="banner" role="alert">'+E(msg)+'</div>'+(alt?'<button class="btn pri block" type="button" id="kAlt">SOLICITAR VERIFICACIÓN ALTERNATIVA</button>':'')+'<button class="btn ghost block" type="button" id="kBack" style="margin-top:10px">Volver al inicio</button>';var a=$('kAlt');if(a)a.onclick=function(){kAltPedir(K.sel.pin_bloqueado?'pin_bloqueado':'olvide_pin')};$('kBack').onclick=kReset}
function kDone(r){
  var p=K.sel,s=r.sesion||{},acc=r.accion||K.accion,lbl=ACC[acc][2],nom=p.nombre.split(' ')[0];
  var via=r.verificado_con==='FACE'?'IDENTIDAD VERIFICADA':r.verificado_con==='TEMPORARY_PIN'?'PIN TEMPORAL VERIFICADO':'PIN VERIFICADO';
  var hi=acc==='salida'?'¡Gracias por tu trabajo, '+nom+'!':acc==='descanso_inicio'?'Disfruta tu descanso, '+nom+'.':acc==='descanso_fin'?'¡Bienvenido de vuelta, '+nom+'!':saludo()+', '+nom+'.';
  kVis('done',via,hi,'✓');
  var cards='<div class="v-card"><span class="v-ic">'+SV.clock+'</span><div><div class="done-big">'+E(lbl)+' · '+E(hm12(r.servidor_at))+'</div><small>'+E(dia(r.servidor_at))+'</small></div></div>';
  if(s.turno)cards+='<div class="v-card"><span class="v-ic">'+SV.cal+'</span><div><b>Turno programado</b><small style="text-transform:none">'+hm12(s.turno.inicio)+' — '+hm12(s.turno.fin)+(ROL[p.rol]?' · '+E(ROL[p.rol]):'')+'</small></div></div>';
  if(acc==='salida'&&s.minutos_trabajados!=null)cards+='<div class="v-card"><span class="v-ic">'+SV.bars+'</span><div><b>Trabajaste '+fmtH(s.minutos_trabajados)+'</b><small style="text-transform:none">Lo verás en MI TURNO</small></div></div>';
  var fl=(s.banderas||[]).filter(function(b){return b.tipo==='tarde'})[0];
  $('kPanel').innerHTML='<div class="v-head"><span class="ck">✓</span>'+E(via)+'</div><div class="v-hi">'+E(hi)+'</div>'+cards+(fl?'<p class="note">Llegaste '+fmtH(fl.minutos)+' después del inicio del turno. Si hubo un motivo, cuéntalo en MI TURNO.</p>':'')+(r.idempotente?'<p class="note">Ya estaba registrado: no se duplicó.</p>':'')+'<div class="v-ok"><div class="big">✓</div><b>Todo listo ✦</b><small>'+(acc==='salida'?'Descansa, nos vemos pronto.':'Que tengas un gran día.')+'</small></div><button class="btn pri block" type="button" id="kBack">Listo</button>';
  $('kBack').onclick=kReset;clearTimeout(K.idle);K.idle=setTimeout(kReset,8000);
  try{if(EMBED&&W.parent!==W)W.parent.postMessage({tipo:'luzcheck:registro',accion:acc},location.origin)}catch(e){}
}
async function kAltPedir(motivo){
  var p=K.sel;kVis('checking','SOLICITANDO…','',ini(p.nombre));
  try{var r=await call('POST','/api/equipo/kiosko/alternativa',{empleado_id:p.id,motivo:motivo},{'x-wf-device':devTok()});K.acc=r.acceso.id;kAltEsperar()}
  catch(e){kVis('failed','NO SE PUDO',e.message,ini(p.nombre));kFail(e.message,false)}
}
function kAltEsperar(){
  var p=K.sel;kVis('wait','ESPERANDO APROBACIÓN','Un supervisor debe aprobar',ini(p.nombre));clearTimeout(K.idle);
  $('kPanel').innerHTML='<div class="k-kicker">VERIFICACIÓN ALTERNATIVA</div><h2>Avísale a tu supervisor</h2><p>Debe aprobarla en Equipo → AHORA o en su MI TURNO. Te dirá en persona un PIN de 6 números que sirve una sola vez.</p><div class="banner info" id="kAltSt">Esperando aprobación…</div><button class="btn ghost block" type="button" id="kBack">Cancelar</button>';
  $('kBack').onclick=kReset;clearInterval(K.altPoll);var t0=Date.now();
  K.altPoll=setInterval(async function(){
    if(Date.now()-t0>16*60000){clearInterval(K.altPoll);return kReset()}
    try{var r=await call('GET','/api/equipo/kiosko/alternativa/'+K.acc,null,{'x-wf-device':devTok()}),a=r.acceso;
      if(a.estado==='aprobada'){clearInterval(K.altPoll);K.temp=true;K.accExp=a.expira_at?new Date(a.expira_at).getTime():0;if(!K.accion){var s=p.sesion;K.accion=!s?'entrada':s.estado==='ON_BREAK'?'descanso_fin':'salida'}K.key=uuid();kPin()}
      else if(a.estado!=='pendiente'){clearInterval(K.altPoll);kVis('failed',a.estado==='rechazada'?'RECHAZADA':'VENCIDA','',ini(p.nombre));kFail(a.estado==='rechazada'?'Tu supervisor rechazó la solicitud.':'La solicitud venció. Pide una nueva.',false)}
    }catch(e){var st=$('kAltSt');if(st)st.textContent=e.message}
  },3000);
}
function kSalir(){var l=layer('<h3>Administrar este dispositivo</h3><p class="note">Para quitar LUZ CHECK de esta tablet escribe el PIN del restaurante. Para desactivarla del todo, hazlo también en el panel (Equipo → Personal → Tablets).</p><label class="f"><span>PIN del restaurante</span><input class="in" id="sP" type="password" inputmode="numeric" maxlength="8"></label><button class="btn bad block" type="button" id="sGo">Quitar LUZ CHECK de esta tablet</button><div class="err" id="sE"></div>');l.el.querySelector('#sGo').onclick=async function(){try{await call('POST','/api/equipo/sesion',{restaurante_id:RID,pin:l.el.querySelector('#sP').value.trim()});ls('hl_wf_dev_'+RID,null);location.href='?r='+RID}catch(e){l.el.querySelector('#sE').textContent=e.message}}}

/* ═══════════════ MI TURNO (celular) ═══════════════ */
var M={tab:'turno',d:null,tick:null,luz:null,segN:null,liv:null};
function empTok(){try{var x=JSON.parse(ls('hl_wf_emp_'+RID)||'null');if(x&&x.exp>Date.now())return x.t}catch(e){}return null}
function setEmp(t,exp){ls('hl_wf_emp_'+RID,JSON.stringify({t:t,exp:new Date(exp).getTime()}))}
function api(m,p,b){return call(m,p,b,{Authorization:'Bearer '+(empTok()||'')}).catch(function(e){if(e.status===401&&e.code==='sesion_invalida'){ls('hl_wf_emp_'+RID,null);login(e.message)}throw e})}
function portal(){if(empTok())return mApp();login()}
function heroHTML(ok,small){return '<div class="hero'+(ok?' ok':'')+'"'+(small?' style="width:170px;height:170px;margin:4px auto 14px"':'')+'><div class="ring c"></div><div class="ring"></div><div class="ring b"></div><div class="face">'+(ok?'<span style="font-size:64px;color:#bfffe6">✓</span>':SV.facebig+'<span class="line"></span>')+'</div></div>'}
function login(msg,modo){
  modo=modo||'entrar';
  $('app').innerHTML='<div class="center"><div style="max-width:440px;width:100%">'+heroHTML(false,true)+'<h1 style="text-align:center;margin:0 0 4px;font-size:30px;letter-spacing:.04em">MI TURNO</h1><p style="text-align:center;color:var(--tx2);margin:0 0 18px">'+E(S.rest.nombre)+'</p><div class="glass pad" style="padding:22px"><div class="seg" role="tablist"><button type="button" data-m="entrar" class="'+(modo==='entrar'?'on':'')+'">Entrar</button><button type="button" data-m="activar" class="'+(modo==='activar'?'on':'')+'">Primera vez</button></div>'+
  (modo==='entrar'?'<label class="f"><span>Tu teléfono</span><input class="in" id="lT" inputmode="tel" autocomplete="tel" maxlength="15"></label><label class="f"><span>Tu PIN de trabajo</span><input class="in" id="lP" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></label><button class="btn pri block" id="lGo">Entrar ✦</button>':
  '<p class="note" style="margin-top:0;font-size:13.5px">Tu administrador te dio un código de 8 letras. Con él creas tu propio PIN de trabajo; nadie más lo conoce, ni el restaurante.</p><label class="f"><span>Tu teléfono</span><input class="in" id="lT" inputmode="tel" maxlength="15"></label><label class="f"><span>Código de activación</span><input class="in" id="lC" maxlength="9" autocapitalize="characters" style="letter-spacing:.2em;text-transform:uppercase"></label><label class="f"><span>Crea tu PIN (4 a 6 números)</span><input class="in" id="lP" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label><label class="f"><span>Repite tu PIN</span><input class="in" id="lP2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label><button class="btn pri block" id="lGo">Crear mi PIN y entrar ✦</button>')+
  '<div class="err" id="lE" role="alert">'+E(msg||'')+'</div></div><p class="note" style="text-align:center;margin-top:14px">MI TURNO solo muestra tus datos. No usa GPS.</p>'+(MODO!=='check'?'<button class="btn ghost block sm" id="lK" style="margin-top:4px">¿Es la tablet del restaurante? Activar LUZ CHECK</button>':'')+'</div></div>';
  D.querySelectorAll('.seg button').forEach(function(b){b.onclick=function(){login('',b.dataset.m)}});
  var k=$('lK');if(k)k.onclick=kioskActivar;
  $('lGo').onclick=async function(){var b=this,e=$('lE');e.textContent='';b.disabled=true;try{var r;if(modo==='entrar')r=await call('POST','/api/equipo/empleado/login',{restaurante_id:RID,telefono:$('lT').value,pin:$('lP').value});else{if($('lP').value!==$('lP2').value)throw new Error('Los PIN no coinciden.');r=await call('POST','/api/equipo/empleado/activar',{restaurante_id:RID,telefono:$('lT').value,codigo:$('lC').value,pin:$('lP').value})}setEmp(r.token,r.expira_at);mApp()}catch(x){e.textContent=x.message;b.disabled=false}};
}
async function mApp(){
  $('app').innerHTML='<div class="m-wrap"><div class="m-top"><div class="brand"><span class="orb"></span><div><b>MI TURNO</b><small>'+E(S.rest.nombre)+'</small></div></div><button class="me" type="button" id="mMe" aria-label="Mi cuenta"></button></div><div id="mV"><div class="glass" style="height:260px"></div></div></div><nav class="nav" id="mNav" aria-label="Secciones"></nav>';
  await mLoad();
}
async function mLoad(){try{M.d=await api('GET','/api/equipo/mi/resumen');S.tz=M.d.zona_horaria||S.tz;$('mMe').innerHTML=av(M.d.yo);$('mMe').onclick=function(){M.tab='mas';mNav();mRender()};mNav();mRender()}catch(e){if(e.status!==401&&$('mV')){$('mV').innerHTML='<div class="glass pad"><b>'+(e.code==='offline'?'Sin conexión':'No se pudo cargar')+'</b><p class="note">'+E(e.message)+'</p><button class="btn" id="mR">Reintentar</button></div>';$('mR').onclick=mLoad}}}
function mNav(){var t=[['turno','Mi turno',SV.clock],['horarios','Mis horarios',SV.cal],['nomina','Mi nómina',SV.money]];if(M.d.supervisa||M.d.aprueba_pin)t.push(['sup','Supervisar',SV.shield]);t.push(['mas','Más',SV.dots]);$('mNav').innerHTML=t.map(function(x){return '<button class="tab'+(M.tab===x[0]?' on':'')+'" type="button" data-t="'+x[0]+'" aria-current="'+(M.tab===x[0]?'page':'false')+'">'+x[2]+x[1]+'</button>'}).join('');$('mNav').querySelectorAll('.tab').forEach(function(b){b.onclick=function(){M.tab=b.dataset.t;mNav();mRender();scrollTo(0,0)}})}
function mRender(){clearInterval(M.tick);({turno:vTurno,horarios:vHorarios,nomina:vNomina,sup:vSup,mas:vMas})[M.tab]()}
function liveMin(s){if(!s)return 0;var n=now(),br=Number(s.descanso_seg||0)*1000;if(s.descanso_inicio_at)br+=n-new Date(s.descanso_inicio_at).getTime();return Math.max(0,(n-new Date(s.entrada_at).getTime()-br)/60000)}
function descansoTxt(){var ev=M.d.eventos_sesion||[],s=M.d.sesion_abierta,ini2=null,out=[];ev.forEach(function(e){if(e.accion==='descanso_inicio')ini2=e.at;if(e.accion==='descanso_fin'&&ini2){out.push(hm12(ini2)+' – '+hm12(e.at));ini2=null}});if(s&&s.descanso_inicio_at)out.push('Desde '+hm12(s.descanso_inicio_at));return out.length?out[out.length-1]:'Sin descanso aún'}
function semana(){var d=M.d,hoy=dayKey(now()),t=new Date(hoy+'T12:00:00Z'),w=(t.getUTCDay()+6)%7,dias=[],mx=60;t.setUTCDate(t.getUTCDate()-w);for(var i=0;i<7;i++)dias.push({k:new Date(t.getTime()+i*864e5).toISOString().slice(0,10),m:0});
  var add=function(k,m){var f=dias.filter(function(x){return x.k===k})[0];if(f)f.m+=m};(d.sesiones||[]).forEach(function(s){add(dayKey(s.entrada_at),Number(s.minutos_trabajados||0))});if(d.sesion_abierta)add(dayKey(d.sesion_abierta.entrada_at),liveMin(d.sesion_abierta));
  dias.forEach(function(x){mx=Math.max(mx,x.m)});var L=['L','M','M','J','V','S','D'];
  return {tot:dias.reduce(function(a,x){return a+x.m},0),html:'<div class="bars">'+dias.map(function(x,i){return '<div class="'+(x.k===hoy?'hoy':'')+'"><i class="'+(x.m?'':'zero')+'" style="height:'+Math.max(4,Math.round(x.m/mx*84))+'px" title="'+fmtH(x.m)+'"></i><span>'+L[i]+'</span></div>'}).join('')+'</div>'}}
function luzCard(){var y=M.d.yo,b=M.d.biometria||{};
  if(y.luz_id)return '<div class="glass luzid"><span class="face-ic">'+SV.face+'</span><div><b>LUZ ID activo ✦</b><small>Inicia tu día en LUZ CHECK con solo mirar la cámara.</small></div><span class="chip ok"><i></i>Activo</span></div>';
  return '<div class="glass luzid"><span class="face-ic">'+SV.face+'</span><div><b>Configura tu LUZ ID ✦</b><small>'+(b.configurado?'Inicia tu día con solo mirar la cámara. Tarda unos 20 segundos.':'Deja lista tu autorización. Tu restaurante activará el reconocimiento facial pronto.')+'</small></div><button class="btn pri sm" type="button" id="mLuz">Configurar</button></div>'}
function vTurno(){
  var d=M.d,s=d.sesion_abierta,y=d.yo,next=d.proximos_turnos[0],cur=next&&new Date(next.inicio).getTime()<=now()?next:null,pend=(d.documentos||[]).filter(function(x){return x.estado==='pendiente'}).length;
  var tot=cur?(new Date(cur.fin)-new Date(cur.inicio))/60000:540,C=2*Math.PI*62,sem=semana();
  var h='<div class="hello">'+av(y)+'<div><b>Hola, '+E(y.nombre.split(' ')[0])+'.</b><small>'+E(ROL[y.rol]||y.rol)+' · '+E(dia(now()))+'</small></div></div>';
  if(pend)h+='<div class="banner info">Tienes '+pend+' documento(s) por revisar en Más.</div>';
  var kv=s?'<div><small>Entrada</small><b>'+hm12(s.entrada_at)+'</b></div><div><small>Descanso</small><b>'+E(descansoTxt())+'</b></div><div><small>Salida programada</small><b>'+(cur?hm12(cur.fin):'—')+'</b></div>'
    :next?'<div><small>Próximo turno</small><b>'+E(diaC(next.inicio))+'</b></div><div><small>Horario</small><b>'+hm12(next.inicio)+' – '+hm12(next.fin)+'</b></div><div><small>Área</small><b>'+E(ROL[next.rol]||next.rol)+'</b></div>'
    :'<div><small>Próximo turno</small><b>Sin turnos publicados</b></div><div><small>Esta semana</small><b>'+fmtH(sem.tot)+'</b></div>';
  h+='<div class="glass ringcard">'+(s?'<span class="chip '+(s.estado==='ON_BREAK'?'warn':'ok')+'"><i></i>'+(s.estado==='ON_BREAK'?'En descanso':'En turno')+' · <span id="mLiveT">'+fmtH(liveMin(s))+'</span></span>':'<span class="chip"><i></i>Fuera de turno</span>')+
   '<div class="ringgrid"><div class="ringbox"><svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="62" stroke="rgba(111,134,173,.18)" stroke-width="12" fill="none"/><circle id="mArc" cx="75" cy="75" r="62" stroke="url(#mgr)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+C+'"/><defs><linearGradient id="mgr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27D7FF"/><stop offset=".6" stop-color="#31E6A1"/><stop offset="1" stop-color="#7A4DFF"/></linearGradient></defs></svg><div class="mid"><div><b id="mBig">'+(s?fmtH(liveMin(s)):'0h')+'</b><small>'+(cur?'de '+fmtH(tot):s?'trabajadas':'hoy')+'</small></div></div></div><div class="kv2">'+kv+'</div></div>'+mMarcar(s)+'</div>';
  h+='<div class="sec-t">Mi identidad</div>'+luzCard();
  h+='<div class="sec-t">Esta semana <span style="letter-spacing:0;text-transform:none;color:#dfe8ff;font-size:14px">'+fmtH(sem.tot)+'</span></div><div class="glass pad">'+sem.html+'</div>';
  if(d.pago&&d.pago.item){var p=d.pago,it=p.item;h+='<div class="sec-t">Mi pago <button type="button" id="mGoN">Ver detalle ›</button></div><div class="total" style="margin-top:0"><div><small>'+E(dm(p.periodo.inicio))+' – '+E(dm(p.periodo.fin))+'</small><strong>'+money(it.total,p.moneda)+'</strong></div><span class="chip '+(p.etiqueta==='ESTIMADO'?'warn':p.etiqueta==='APROBADO'?'ok':'lz')+'">'+E(p.etiqueta)+'</span></div>'}
  $('mV').innerHTML=h;
  var upd=function(){var m=liveMin(s),a=$('mArc');if(!a){clearInterval(M.tick);return}$('mLiveT').textContent=fmtH(m);$('mBig').textContent=fmtH(m);a.setAttribute('stroke-dashoffset',String(C*(1-Math.min(1,m/tot))))};if(s){upd();M.tick=setInterval(upd,15000)}
  D.querySelectorAll('[data-fa]').forEach(function(b){b.onclick=function(){mFichar(b.dataset.fa)}});
  var ml=$('mLuz');if(ml)ml.onclick=luzIdFlow;var gn=$('mGoN');if(gn)gn.onclick=function(){M.tab='nomina';mNav();mRender();scrollTo(0,0)};
}
function mMarcar(s){
  if(!M.d.marcar_desde_celular)return '<div class="hint"><span class="v-ic">'+SV.person+'</span><div><b>Marca en LUZ CHECK ✦</b><small>Al llegar toca <b>INICIAR DÍA</b> en el restaurante, elige tu nombre y '+(M.d.yo.luz_id?'mira la cámara.':'escribe tu PIN.')+'</small></div></div>';
  var a=!s?['entrada']:s.estado==='ACTIVE'?['descanso_inicio','salida']:['descanso_fin','salida'],lbl={entrada:'Iniciar turno',descanso_inicio:'Registrar descanso',descanso_fin:'Terminar descanso',salida:'Finalizar turno'};
  return '<div class="btn-row"'+(a.length===1?' style="grid-template-columns:1fr"':'')+'>'+a.map(function(x){return '<button class="btn '+(x==='salida'?'pk':x==='entrada'?'pri':'ghost')+'" type="button" data-fa="'+x+'">'+lbl[x]+'</button>'}).join('')+'</div>'}
function mFichar(accion){var key=uuid(),t={entrada:'Iniciar turno',descanso_inicio:'Registrar descanso',descanso_fin:'Terminar descanso',salida:'Finalizar turno'}[accion],l=layer('<h3>'+E(t)+'</h3><p class="note">Confirma con tu PIN. La hora la registra el servidor.</p><label class="f"><span>Tu PIN</span><input class="in" id="fP" type="password" inputmode="numeric" maxlength="6"></label><button class="btn pri block" id="fGo">Confirmar</button><div class="err" id="fE" role="alert"></div>');l.el.querySelector('#fGo').onclick=async function(){var b=this;b.disabled=true;try{var r=await api('POST','/api/equipo/mi/fichar',{accion:accion,pin:l.el.querySelector('#fP').value,client_key:key});l.close();toast(ACC[accion][2]+' registrada · '+hm12(r.servidor_at));mLoad()}catch(e){l.el.querySelector('#fE').textContent=e.message;b.disabled=false}}}
function vHorarios(){
  var d=M.d,hoyK=dayKey(now()),by={};d.proximos_turnos.forEach(function(t){var k=dayKey(t.inicio);(by[k]=by[k]||[]).push(t)});
  var DOW=['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'],h='<div class="sec-t" style="margin-top:0">Próximos días</div><div class="glass pad">';
  for(var i=0;i<14;i++){var dt=new Date(new Date(hoyK+'T12:00:00Z').getTime()+i*864e5),k=dt.toISOString().slice(0,10),ts=by[k]||[];if(i>=7&&!ts.length)continue;
    h+='<div class="day'+(k===hoyK?' hoy':'')+'"><div class="dbadge"><small>'+DOW[dt.getUTCDay()]+'</small><b>'+dt.getUTCDate()+'</b></div><div>'+(ts.length?ts.map(function(t){return '<div class="shift"><span>'+hm12(t.inicio)+' – '+hm12(t.fin)+'</span><small>'+E(ROL[t.rol]||t.rol)+'</small></div>'+(t.notas?'<small class="note">'+E(t.notas)+'</small>':'')}).join(''):'<span class="libre">'+(k===hoyK?'Hoy no tienes turno':'Libre')+'</span>')+'</div></div>'}
  h+='</div><div class="sec-t">Mi disponibilidad <button type="button" id="aEdit">Editar ›</button></div><div class="glass pad" id="aSum"><p class="note" style="margin:0">Cargando…</p></div><p class="note" style="margin:10px 4px">La disponibilidad no es un turno: ayuda a tu restaurante a planear y repartir horas de forma justa.</p>';
  $('mV').innerHTML=h;
  var DN=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],ord=[1,2,3,4,5,6,0],disp=[];
  var pintar=function(){var m={};disp.forEach(function(x){m[x.dia_semana]=x});var ds=ord.filter(function(dw){return m[dw]});$('aSum').innerHTML=ds.length?ds.map(function(dw){var x=m[dw];return '<div class="row"><b>'+DN[dw]+'</b><span class="val">'+E(String(x.desde).slice(0,5))+' – '+E(String(x.hasta).slice(0,5))+'</span></div>'}).join(''):'<p class="note" style="margin:0">Aún no registras tu disponibilidad. Toca Editar.</p>'};
  api('GET','/api/equipo/mi/disponibilidad').then(function(r){disp=r.disponibilidad||[];pintar()}).catch(function(e){$('aSum').innerHTML='<p class="err">'+E(e.message)+'</p>'});
  $('aEdit').onclick=function(){var m={};disp.forEach(function(x){m[x.dia_semana]=x});var l=layer('<h3>Mi disponibilidad</h3><p class="note">Marca los días y el horario en que puedes trabajar.</p><div id="aL">'+ord.map(function(dw){var x=m[dw];return '<div class="avail"><b>'+DN[dw]+'</b><input type="checkbox" data-d="'+dw+'" aria-label="Disponible el '+DN[dw]+'"'+(x?' checked':'')+'><input class="in" type="time" data-f="'+dw+'" value="'+(x?String(x.desde).slice(0,5):'12:00')+'" aria-label="Desde"><input class="in" type="time" data-h="'+dw+'" value="'+(x?String(x.hasta).slice(0,5):'22:00')+'" aria-label="Hasta"></div>'}).join('')+'</div><button class="btn pri block" id="aSave" style="margin-top:8px">Guardar disponibilidad</button><div class="err" id="aE" role="alert"></div>');
    l.el.querySelector('#aSave').onclick=async function(){var b=this,arr=[];l.el.querySelectorAll('[data-d]').forEach(function(c){if(c.checked){var dw=c.dataset.d;arr.push({dia_semana:+dw,desde:l.el.querySelector('[data-f="'+dw+'"]').value,hasta:l.el.querySelector('[data-h="'+dw+'"]').value})}});b.disabled=true;try{await api('PUT','/api/equipo/mi/disponibilidad',{disponibilidad:arr});disp=arr;pintar();l.close();toast('Disponibilidad guardada ✦')}catch(e){l.el.querySelector('#aE').textContent=e.message;b.disabled=false}}};
}
function vNomina(){
  var d=M.d,p=d.pago;
  if(!p||!p.item){$('mV').innerHTML='<div class="sec-t" style="margin-top:0">Detalle de mi nómina</div><div class="glass pad"><p class="note" style="margin:0">Aún no hay un periodo calculado para ti. Cuando el restaurante lo calcule, aquí verás tus horas, cómo se calculó tu pago y su estado.</p></div>'+misRegistros();return wireReg()}
  var it=p.item,apr=p.etiqueta!=='ESTIMADO';if(M.segN==null)M.segN=apr?'a':'e';var seg=M.segN,t=it.tarifa_hora,fx=Number(it.factor_extra||1),tx=t!=null?Math.round(t*fx):null;
  var aj=function(tipo){return (it.ajustes||[]).filter(function(a){return a.tipo===tipo}).map(function(a){return '<small>'+E(a.razon)+'</small>'}).join('')};
  var h='<div class="sec-t" style="margin-top:0">Detalle de mi nómina</div><div class="glass pad"><div class="seg"><button type="button" data-s="e" class="'+(seg==='e'?'on':'')+'">Estimado</button><button type="button" data-s="a" class="'+(seg==='a'?'on':'')+'">Aprobado</button></div>';
  if(seg==='a'&&!apr)h+='<p class="note" style="margin:6px 0 0">El restaurante aún no aprueba este periodo. Lo que ves en Estimado puede cambiar hasta entonces.</p></div>';
  else h+='<div class="row"><b>Periodo</b><div class="val" style="white-space:normal">'+E(dm(p.periodo.inicio))+' – '+E(dm(p.periodo.fin))+'</div></div>'+
    '<div class="row"><div><b>Horas normales</b><small>'+fmtH(it.minutos_normales)+(t!=null?' × '+money(t,p.moneda):'')+'</small></div><div class="val">'+(t!=null?money(it.bruto_normal,p.moneda):'—')+'</div></div>'+
    '<div class="row"><div><b>Horas extra</b><small>'+fmtH(it.minutos_extra)+(tx!=null?' × '+money(tx,p.moneda):'')+'</small></div><div class="val">'+(t!=null?money(it.bruto_extra,p.moneda):'—')+'</div></div>'+
    '<div class="row"><div><b>Bonificaciones</b>'+aj('bono')+'</div><div class="val" style="color:#8ff7d2">'+money(it.bonos||0,p.moneda)+'</div></div>'+
    '<div class="row"><div><b>Deducciones</b>'+aj('deduccion')+'</div><div class="val" style="color:#ffabbd">'+(it.deducciones?'−'+money(it.deducciones,p.moneda):money(0,p.moneda))+'</div></div>'+
    '<div class="total"><div><small>'+(p.etiqueta==='ESTIMADO'?'Total estimado':'Total '+E(p.etiqueta.toLowerCase()))+'</small><strong>'+money(it.total,p.moneda)+'</strong></div><small style="text-align:right">'+(p.etiqueta==='ESTIMADO'?'Pendiente de aprobación':p.etiqueta==='APROBADO'?'Aprobado por el restaurante':'Pago registrado')+'</small></div>'+
    (t==null?'<p class="note">Tu tarifa aún no está configurada: pregúntale al restaurante.</p>':'')+'<p class="note">Horas × tarifa'+(fx!==1?' (hora extra × '+fx+')':'')+' + bonos − deducciones. No incluye descuentos de ley.</p><button class="btn pri block" type="button" id="nDet">Ver detalle completo</button></div>';
  $('mV').innerHTML=h+misRegistros();
  D.querySelectorAll('.seg [data-s]').forEach(function(b){b.onclick=function(){M.segN=b.dataset.s;vNomina()}});
  var nd=$('nDet');if(nd)nd.onclick=function(){layer('<h3>Mis horas del periodo</h3><p class="note">Día por día, calculado por el servidor.</p>'+((it.dias||[]).length?it.dias.map(function(x){return '<div class="row"><div><b>'+E(diaC(x.dia+'T12:00:00Z'))+'</b><small>'+fmtH(x.normales)+' normales'+(x.extra?' · '+fmtH(x.extra)+' extra':'')+'</small></div><div class="val">'+fmtH(x.minutos)+'</div></div>'}).join(''):'<p class="note">Sin días registrados.</p>'))};
  wireReg();
}
function misRegistros(){var d=M.d,FL={tarde:'Tarde',sin_turno:'Sin turno',salida_temprana:'Salida temprana',turno_largo:'Turno largo',corregida:'Corregida',manual:'Registro manual',temprano:'Temprano'},EI={abierta:['Abierta','warn'],info_solicitada:['Te piden información','warn'],aprobada:['Aprobada','ok'],parcial:['Aprobada en parte','ok'],rechazada:['No aprobada','bad']};
  var h='';if(d.incidencias.length)h+='<div class="sec-t">Mis reportes</div><div class="glass pad">'+d.incidencias.map(function(i){var e=EI[i.estado]||[i.estado,''];return '<div class="row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b style="white-space:pre-wrap;font-size:13.5px;font-weight:600">'+E(i.descripcion)+'</b><span class="chip '+e[1]+'">'+E(e[0])+'</span></div>'+(i.resolucion?'<small>Respuesta: '+E(i.resolucion)+'</small>':'')+(i.estado==='info_solicitada'?'<div style="display:flex;gap:8px;margin-top:8px"><input class="in" data-ri="'+i.id+'" placeholder="Tu respuesta"><button class="btn sm pri" data-rb="'+i.id+'">Enviar</button></div>':'')+'</div>'}).join('')+'</div>';
  h+='<div class="sec-t">Mis registros · últimos 20 días</div><div class="glass pad">'+(d.sesiones.length?d.sesiones.map(function(s){return '<div class="row"><div><b>'+E(diaC(s.entrada_at))+'</b><small>'+hm12(s.entrada_at)+' – '+hm12(s.salida_at)+' · '+fmtH(s.minutos_trabajados)+(s.banderas&&s.banderas.length?' · '+s.banderas.map(function(b){return FL[b.tipo]||b.tipo}).join(', '):'')+'</small></div><button class="btn sm ghost" data-rep="'+s.id+'">¿No coincide?</button></div>'}).join(''):'<p class="note" style="margin:0">Aún no tienes registros.</p>')+'</div><p class="note" style="margin:10px 4px">Si una hora no coincide, repórtala: tu supervisor la revisa. Nadie cambia tus horas sin dejar razón y registro.</p>';return h}
function wireReg(){var d=M.d;D.querySelectorAll('[data-rep]').forEach(function(b){b.onclick=function(){reportar(d.sesiones.filter(function(x){return x.id===b.dataset.rep})[0])}});D.querySelectorAll('[data-rb]').forEach(function(b){b.onclick=async function(){var inp=D.querySelector('[data-ri="'+b.dataset.rb+'"]');try{await api('POST','/api/equipo/mi/incidencias/'+b.dataset.rb+'/responder',{texto:inp.value});toast('Respuesta enviada');mLoad()}catch(e){toast(e.message)}}})}
function reportar(s){var l=layer('<h3>Reportar una diferencia</h3><p class="note">'+E(diaC(s.entrada_at))+' · '+hm12(s.entrada_at)+' – '+hm12(s.salida_at)+'</p><label class="f"><span>¿Qué pasó?</span><select class="sel" id="rT"><option value="diferencia_horas">La hora registrada no es correcta</option><option value="salida_faltante">No pude marcar mi salida</option><option value="otro">Otro</option></select></label><label class="f"><span>Hora real de salida (opcional)</span><input class="in" type="time" id="rH"></label><label class="f"><span>Cuéntalo</span><textarea class="ta" id="rD" maxlength="600" placeholder="Ej.: salí a las 10:40 pm porque cerramos tarde"></textarea></label><button class="btn pri block" id="rGo">Enviar a mi supervisor</button><div class="err" id="rE" role="alert"></div>');
  l.el.querySelector('#rGo').onclick=async function(){var b=this,hh=l.el.querySelector('#rH').value,hp=null;if(hh){var base=s.salida_at||s.entrada_at,p=tzp(base),day=p.year+'-'+p.month+'-'+p.day,g=new Date(day+'T'+hh+':00Z').getTime(),off=(function(){var q=tzp(g);return Math.round((Date.UTC(+q.year,+q.month-1,+q.day,+q.hour,+q.minute)-g)/60000)})();hp=new Date(g-off*60000);if(hp<new Date(s.entrada_at))hp=new Date(hp.getTime()+864e5);hp=hp.toISOString()}b.disabled=true;try{await api('POST','/api/equipo/mi/incidencias',{sesion_id:s.id,tipo:l.el.querySelector('#rT').value,descripcion:l.el.querySelector('#rD').value,hora_propuesta:hp});l.close();toast('Enviado. Tus horas no cambian hasta que lo revisen.');mLoad()}catch(e){l.el.querySelector('#rE').textContent=e.message;b.disabled=false}}}
async function vSup(){
  $('mV').innerHTML='<div class="sec-t" style="margin-top:0">Verificaciones por aprobar</div><div class="glass pad" id="sA"><p class="note" style="margin:0">Cargando…</p></div><div class="sec-t">Equipo ahora</div><div class="glass pad" id="sN"><p class="note" style="margin:0">Cargando…</p></div>';
  var MOT={olvide_pin:'Olvidó su PIN',pin_bloqueado:'PIN bloqueado',sin_pin:'Aún sin PIN',rostro_no_reconocido:'Rostro no reconocido',camara_no_disponible:'Cámara no disponible',otro:'Otro'};
  if(M.d.aprueba_pin)api('GET','/api/equipo/accesos').then(function(r){var p=r.accesos.filter(function(a){return a.estado==='pendiente'});$('sA').innerHTML=p.length?p.map(function(a){return '<div class="row"><div><b>'+E(a.empleado?a.empleado.nombre:'Persona')+'</b><small>'+E(MOT[a.motivo]||a.motivo)+'</small></div>'+(a.propia?'<span class="chip warn">Tuya: la aprueba otra persona</span>':'<div style="display:flex;gap:6px"><button class="btn sm ok" data-ap="'+a.id+'">Aprobar</button><button class="btn sm bad" data-rj="'+a.id+'">Rechazar</button></div>')+'</div>'}).join(''):'<p class="note" style="margin:0">No hay solicitudes pendientes.</p>';
    D.querySelectorAll('[data-ap]').forEach(function(b){b.onclick=async function(){b.disabled=true;try{var x=await api('POST','/api/equipo/accesos/'+b.dataset.ap+'/decidir',{decision:'aprobar'});var l=layer('<h3>PIN temporal para '+E(x.para)+'</h3><p class="note">Díselo en persona. No lo envíes por chat ni captura. Sirve una sola vez.</p><div class="bigpin">'+E(x.pin)+'</div><p class="note" style="text-align:center">Vence en '+Math.round(x.expira_seg/60)+' minutos.</p><button class="btn pri block" id="pOk">Ya se lo dije</button>');l.el.querySelector('#pOk').onclick=function(){l.close();vSup()}}catch(e){toast(e.message);vSup()}}});
    D.querySelectorAll('[data-rj]').forEach(function(b){b.onclick=function(){var l=layer('<h3>Rechazar</h3><label class="f"><span>Razón</span><textarea class="ta" id="zR"></textarea></label><button class="btn bad block" id="zGo">Rechazar</button><div class="err" id="zE"></div>');l.el.querySelector('#zGo').onclick=async function(){try{await api('POST','/api/equipo/accesos/'+b.dataset.rj+'/decidir',{decision:'rechazar',razon:l.el.querySelector('#zR').value});l.close();vSup()}catch(e){l.el.querySelector('#zE').textContent=e.message}}}})
  }).catch(function(e){$('sA').innerHTML='<p class="err">'+E(e.message)+'</p>'});else $('sA').innerHTML='<p class="note" style="margin:0">Tu rol no aprueba verificaciones.</p>';
  if(M.d.supervisa)api('GET','/api/equipo/ahora').then(function(a){var k=a.conteos,EST={ACTIVE:['En turno','ok'],ON_BREAK:['Descanso','warn'],NO_LLEGA:['No ha llegado','bad'],PROGRAMADO:['Programado','lz'],TERMINO:['Terminó',''],FUERA:['Fuera','']};$('sN').innerHTML='<p class="note" style="margin-top:0">'+k.en_turno+' en turno · '+k.en_descanso+' en descanso · '+k.no_llegan+' sin llegar</p>'+a.personas.filter(function(p){return p.estado!=='FUERA'}).map(function(p){var e=EST[p.estado]||['',''];return '<div class="row"><div><b>'+E(p.nombre)+'</b><small>'+(p.sesion?'Entró '+hm12(p.sesion.entrada_at):p.turno?hm12(p.turno.inicio)+' – '+hm12(p.turno.fin):'')+'</small></div><span class="chip '+e[1]+'">'+e[0]+'</span></div>'}).join('')}).catch(function(e){$('sN').innerHTML='<p class="err">'+E(e.message)+'</p>'});else $('sN').innerHTML='<p class="note" style="margin:0">Tu rol no ve el equipo.</p>';
}
function vMas(){
  var d=M.d,y=d.yo,ED={pendiente:['Por revisar','warn'],aceptado:['Aceptado','ok'],firmado:['Firmado','ok'],rechazado:['No aceptado',''],revocado:['Revocado',''],vencido:['Vencido','']};
  $('mV').innerHTML='<div class="glass pad" style="display:flex;gap:14px;align-items:center">'+av(y)+'<div><b style="font-size:18px">'+E(y.nombre)+'</b><small style="display:block;color:var(--tx2)">'+E(ROL[y.rol]||y.rol)+' · '+E(S.rest.nombre)+'</small></div></div>'+
   '<div class="sec-t">Mi identidad</div><div class="glass pad" style="padding:6px 16px"><button class="menu-row" type="button" id="oLuz"><span class="v-ic">'+SV.face+'</span><div><b>LUZ ID ✦</b><small>'+(y.luz_id?'Activo: marcas con tu rostro':'Configura tu rostro para iniciar tu día')+'</small></div>'+SV.chev+'</button></div>'+
   '<div class="sec-t">Mis documentos</div><div class="glass pad" style="padding:6px 16px">'+(d.documentos.length?d.documentos.map(function(x){var e=ED[x.estado]||[x.estado,''];return '<button class="menu-row" type="button" data-doc="'+x.id+'"><span class="v-ic">'+SV.doc+'</span><div><b>'+E(x.titulo)+'</b><small>Versión '+E(x.version)+'</small></div><span class="chip '+e[1]+'">'+e[0]+'</span></button>'}).join(''):'<p class="note">No tienes documentos.</p>')+'</div>'+
   '<div class="sec-t">Seguridad</div><div class="glass pad" style="padding:6px 16px"><button class="menu-row" type="button" id="cP"><span class="v-ic">'+SV.lock+'</span><div><b>Cambiar mi PIN</b><small>Tu PIN de trabajo es solo tuyo</small></div>'+SV.chev+'</button><button class="menu-row" type="button" id="cO"><span class="v-ic">'+SV.out+'</span><div><b>Cerrar sesión</b><small>En este celular</small></div>'+SV.chev+'</button></div><p class="note" style="text-align:center;margin-top:16px">MI TURNO no usa GPS. Solo ves tus propios datos.</p>';
  D.querySelectorAll('[data-doc]').forEach(function(b){b.onclick=function(){abrirDoc(b.dataset.doc)}});
  $('oLuz').onclick=luzIdFlow;$('cO').onclick=function(){ls('hl_wf_emp_'+RID,null);login()};
  $('cP').onclick=function(){var l=layer('<h3>Cambiar mi PIN</h3><label class="f"><span>PIN actual</span><input class="in" id="pA" type="password" inputmode="numeric" maxlength="6"></label><label class="f"><span>PIN nuevo</span><input class="in" id="pN" type="password" inputmode="numeric" maxlength="6"></label><button class="btn pri block" id="pGo">Guardar</button><div class="err" id="pE"></div>');l.el.querySelector('#pGo').onclick=async function(){try{var r=await api('POST','/api/equipo/mi/pin',{actual:l.el.querySelector('#pA').value,nuevo:l.el.querySelector('#pN').value});setEmp(r.token,r.expira_at);l.close();toast('PIN actualizado')}catch(e){l.el.querySelector('#pE').textContent=e.message}}};
}
async function abrirDoc(id){
  try{var r=await api('GET','/api/equipo/mi/documentos/'+id)}catch(e){return toast(e.message)}
  var x=r.documento,pend=x.estado==='pendiente',bio=x.tipo==='autorizacion_biometrica';
  var l=layer('<h3>'+E(x.titulo)+'</h3><p class="note">Versión '+E(x.version)+(x.contenido_hash?' · huella '+E(x.contenido_hash.slice(0,12)):'')+'</p><div class="doc" id="dT" tabindex="0">'+E(x.contenido_texto||'')+'</div>'+(pend?'<p class="note" id="dH">Lee hasta el final para poder responder.</p><button class="btn pri block" id="dA" disabled>'+(bio?'Autorizo el uso de mis datos biométricos':'Acepto')+'</button><button class="btn ghost block" id="dR" style="margin-top:8px">'+(bio?'No autorizo (seguiré usando mi PIN)':'No acepto')+'</button>':'')+(x.estado==='aceptado'&&bio?'<button class="btn bad block" id="dV" style="margin-top:12px">Revocar mi autorización</button>':'')+'<div class="err" id="dE" role="alert"></div>');
  var t=l.el.querySelector('#dT'),a=l.el.querySelector('#dA');
  var chk=function(){if(a&&t.scrollTop+t.clientHeight>=t.scrollHeight-8){a.disabled=false;var hh=l.el.querySelector('#dH');if(hh)hh.textContent='Gracias por leer. Tú decides.'}};if(t){t.addEventListener('scroll',chk);setTimeout(chk,60)}
  var dec=async function(v){try{await api('POST','/api/equipo/mi/documentos/'+id+'/decidir',{decision:v,leido:true,hash:x.contenido_hash});l.close();toast(v==='aceptar'?'Registrado. Gracias.':'Registrado. Todo sigue igual con tu PIN.');mLoad()}catch(e){l.el.querySelector('#dE').textContent=e.message}};
  if(a)a.onclick=function(){dec('aceptar')};var rj=l.el.querySelector('#dR');if(rj)rj.onclick=function(){dec('rechazar')};
  var rv=l.el.querySelector('#dV');if(rv)rv.onclick=async function(){try{var z=await api('POST','/api/equipo/mi/documentos/'+id+'/revocar');l.close();toast(z.nota);mLoad()}catch(e){l.el.querySelector('#dE').textContent=e.message}};
}

/* ═══ LUZ ID ✦: la persona configura su propio rostro desde su celular ═══ */
function fsOpen(){var f=D.createElement('div');f.className='fs';f.id='luzFs';f.setAttribute('role','dialog');f.setAttribute('aria-modal','true');f.setAttribute('aria-label','Configurar LUZ ID');f.innerHTML='<div class="fs-in" id="fsIn"></div>';D.body.appendChild(f);D.body.style.overflow='hidden'}
function fsClose(){try{M.liv&&M.liv.unmount()}catch(e){}M.liv=null;var f=$('luzFs');if(f)f.remove();D.body.style.overflow='';mLoad()}
function fsTop(step){return '<div class="fs-top"><div class="steps" aria-label="Paso '+step+' de 4">'+[1,2,3,4].map(function(i){return '<i class="'+(i<=step?'on':'')+'"></i>'}).join('')+'</div><button class="xbtn" type="button" id="fsX" aria-label="Cerrar">✕</button></div>'}
function fsSet(html){$('fsIn').innerHTML=html;var x=$('fsX');if(x)x.onclick=fsClose;scrollTo(0,0);var f=$('luzFs');if(f)f.scrollTop=0}
async function luzIdFlow(){
  fsOpen();fsSet('<div class="grow" style="display:grid;place-items:center">'+heroHTML()+'</div>');
  try{M.luz=await api('GET','/api/equipo/mi/luz-id')}catch(e){return fsSet(fsTop(0)+'<p class="err">'+E(e.message)+'</p>')}
  if(M.luz.identidad)return luzActivo();luzIntro();
}
function luzIntro(){fsSet(fsTop(1)+heroHTML()+'<h2>Tu rostro, <em>tu llave ✦</em></h2><p class="lead">Con LUZ ID inicias tu día en LUZ CHECK con solo mirar la cámara. Es opcional: si prefieres, sigues con tu PIN.</p><div class="benef"><div><span class="v-ic">'+SV.nophoto+'</span><span><b>No guardamos fotos</b><small>Solo una plantilla matemática para reconocerte.</small></span></div><div><span class="v-ic">'+SV.shield+'</span><span><b>Solo para tu tiempo de trabajo</b><small>Nada de vigilancia ni evaluaciones.</small></span></div><div><span class="v-ic">'+SV.undo+'</span><span><b>Lo revocas cuando quieras</b><small>Y vuelves a tu PIN sin consecuencias.</small></span></div></div><div class="grow"></div><button class="btn pri block" type="button" id="lzGo">Configurar mi LUZ ID ✦</button><button class="btn ghost block" type="button" id="lzNo" style="margin-top:10px">Ahora no</button>');
  $('lzNo').onclick=fsClose;$('lzGo').onclick=luzAutorizacion}
async function luzAutorizacion(){
  var A=M.luz.autorizacion;if(A&&A.estado==='aceptado')return luzPreparar();
  var doc;try{var r=await api('POST','/api/equipo/mi/luz-id/autorizacion');doc=(await api('GET','/api/equipo/mi/documentos/'+r.documento.id)).documento}catch(e){return fsSet(fsTop(2)+'<p class="err">'+E(e.message)+'</p>')}
  if(doc.estado==='aceptado'){M.luz.autorizacion={estado:'aceptado',id:doc.id};return luzPreparar()}
  fsSet(fsTop(2)+'<h2 style="margin-top:12px">Tu <em>autorización</em></h2><p class="lead">Léela completa. Es un documento aparte: tu contrato no la incluye y no estás obligado(a) a aceptarla.</p><div class="doc" id="lzT" tabindex="0">'+E(doc.contenido_texto||'')+'</div><p class="note" id="lzH">Desliza hasta el final para decidir.</p><div class="grow"></div><button class="btn pri block" type="button" id="lzA" disabled>Autorizo el uso de mis datos biométricos</button><button class="btn ghost block" type="button" id="lzR" style="margin-top:10px">No autorizo (seguiré con mi PIN)</button><div class="err" id="lzE" role="alert"></div>');
  var t=$('lzT'),a=$('lzA');var chk=function(){if(t.scrollTop+t.clientHeight>=t.scrollHeight-8){a.disabled=false;$('lzH').textContent='Gracias por leer. Tú decides.'}};t.addEventListener('scroll',chk);setTimeout(chk,80);
  var dec=async function(v){a.disabled=true;try{await api('POST','/api/equipo/mi/documentos/'+doc.id+'/decidir',{decision:v,leido:true,hash:doc.contenido_hash});if(v==='rechazar'){toast('Registrado. Sigues marcando con tu PIN.');return fsClose()}M.luz.autorizacion={estado:'aceptado',id:doc.id};luzPreparar()}catch(e){$('lzE').textContent=e.message;a.disabled=false}};
  a.onclick=function(){dec('aceptar')};$('lzR').onclick=function(){dec('rechazar')};
}
function luzPreparar(){
  var b=M.luz.biometria||{};
  if(!b.configurado){fsSet(fsTop(3)+heroHTML()+'<h2>Autorización <em>guardada ✓</em></h2><p class="lead">Tu restaurante aún no activó el reconocimiento facial. Cuando lo active, vuelve aquí y termina en unos segundos. Mientras tanto, marca con tu PIN.</p><div class="grow"></div><button class="btn pri block" type="button" id="lzOk">Entendido</button>');$('lzOk').onclick=fsClose;return}
  fsSet(fsTop(3)+'<h2 style="margin-top:12px">Prepárate para <em>escanear</em></h2><p class="lead">Solo toma unos segundos.</p><div class="benef"><div><span class="v-ic">'+SV.sun+'</span><span><b>Busca buena luz</b><small>De frente, sin contraluz.</small></span></div><div><span class="v-ic">'+SV.face+'</span><span><b>Rostro descubierto</b><small>Sin gorra, tapabocas ni gafas oscuras.</small></span></div><div><span class="v-ic">'+SV.person+'</span><span><b>Solo tú frente a la cámara</b><small>Nadie más en la imagen.</small></span></div><div><span class="v-ic">'+SV.phone+'</span><span><b>Celular a la altura de tus ojos</b><small>Verás destellos de colores: así se comprueba que eres tú en persona.</small></span></div></div><div class="grow"></div><button class="btn pri block" type="button" id="lzCam">Abrir cámara ✦</button><div class="err" id="lzE" role="alert"></div>');
  $('lzCam').onclick=luzCamara;
}
async function luzCamara(){
  fsSet(fsTop(4)+'<h2 style="margin-top:10px">Mira la <em>cámara</em></h2><p class="lead">Mantén tu rostro dentro del óvalo hasta que termine.</p><div id="mLive"></div><div class="err" id="lzE" role="alert"></div><button class="btn ghost block" type="button" id="lzCancel" style="margin-top:12px">Cancelar</button>');
  $('lzCancel').onclick=fsClose;
  var lv;try{await loadLiveness();lv=(await api('POST','/api/equipo/mi/luz-id/iniciar')).liveness}catch(e){$('mLive').remove();$('lzE').textContent=e.message;return}
  M.liv=W.LuzLiveness.mount($('mLive'),{sessionId:lv.session_id,region:lv.region,credenciales:lv.credenciales,sinPantallaInicio:true,
    onComplete:async function(){try{M.liv&&M.liv.unmount()}catch(e){}M.liv=null;fsSet(fsTop(4)+'<div class="grow"></div>'+heroHTML()+'<h2>Registrando tu <em>LUZ ID…</em></h2><p class="lead">No cierres esta pantalla.</p><div class="grow"></div>');
      try{await api('POST','/api/equipo/mi/luz-id/completar',{liveness_session_id:lv.session_id});luzListo()}catch(e){fsSet(fsTop(4)+heroHTML()+'<h2>No se <em>registró</em></h2><p class="lead">'+E(e.message)+'</p><div class="grow"></div><button class="btn pri block" type="button" id="lzRe">Intentar de nuevo</button><button class="btn ghost block" type="button" id="lzOut" style="margin-top:10px">Salir</button>');$('lzRe').onclick=luzPreparar;$('lzOut').onclick=fsClose}},
    onCancel:fsClose,
    onError:function(er){diagLiv('mi_turno',er);try{M.liv&&M.liv.unmount()}catch(e){}M.liv=null;var ml=$('mLive');if(ml)ml.remove();$('lzE').textContent=er&&er.estado==='CAMERA_ACCESS_ERROR'?'Necesitamos permiso para usar la cámara. Actívalo en tu navegador e intenta de nuevo.':'No se pudo completar'+(er&&er.estado?' ('+er.estado+')':'')+'. No se registró nada.'+(er&&er.mensaje?' Detalle: '+String(er.mensaje).slice(0,220):'')}});
}
function luzListo(){fsSet(fsTop(4)+'<div class="grow"></div>'+heroHTML(true)+'<h2>LUZ ID <em>registrado ✦</em></h2><p class="lead">Desde tu próximo turno, en LUZ CHECK toca tu nombre y mira la cámara. Tu PIN sigue funcionando por si acaso.</p><div class="grow"></div><button class="btn pri block" type="button" id="lzFin">Listo</button>');$('lzFin').onclick=fsClose}
function luzActivo(){var I=M.luz.identidad,A=M.luz.autorizacion;fsSet(fsTop(4)+heroHTML(true)+'<h2>Tu LUZ ID está <em>activo ✦</em></h2><p class="lead">Registrado el '+E(dia(I.enrolado_at))+'. Úsalo en LUZ CHECK para iniciar tu día.</p><div class="grow"></div>'+(M.luz.biometria&&M.luz.biometria.configurado?'<button class="btn block" type="button" id="lzRedo">Volver a registrar mi rostro</button>':'')+(A&&A.estado==='aceptado'?'<button class="btn bad block" type="button" id="lzRev" style="margin-top:10px">Revocar mi autorización</button>':'')+'<button class="btn pri block" type="button" id="lzOk" style="margin-top:10px">Listo</button><div class="err" id="lzE" role="alert"></div>');
  $('lzOk').onclick=fsClose;var rd=$('lzRedo');if(rd)rd.onclick=luzPreparar;var rv=$('lzRev');if(rv)rv.onclick=async function(){if(!confirm('¿Revocar tu autorización? Tu LUZ ID se elimina y vuelves a marcar con PIN.'))return;try{var z=await api('POST','/api/equipo/mi/documentos/'+A.id+'/revocar');toast(z.nota);fsClose()}catch(e){$('lzE').textContent=e.message}}}
D.addEventListener('visibilitychange',function(){if(!D.hidden&&M.d&&$('mV')&&!$('luzFs')&&!D.querySelector('.layer'))mLoad()});
boot();
})();
</script>
</body>
</html>
