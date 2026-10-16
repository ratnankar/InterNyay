// Runs before the page draws: marks the page when someone is signed in, so the pre-rendered landing page is not flashed at them
// before the app redirects them to the dashboard (see index.html). Kept as a separate file so the site needs no inline scripts.
try { if (localStorage.getItem('internyay_token')) document.documentElement.classList.add('has-session') } catch (e) { /* storage unavailable */ }
// The pre-rendered landing page belongs to "/" only: on /admin, /login and every other address it is never shown, so typing one of
// those addresses no longer flashes the landing page before the real screen appears
try { if (location.pathname.replace(/\/+$/, '') !== '') document.documentElement.classList.add('not-home') } catch (e) { /* no location */ }