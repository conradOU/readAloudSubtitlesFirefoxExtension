var config = {
  serviceUrl: "https://support.readaloud.app",
  webAppUrl: "https://readaloud.app",
  entityMap: {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  },
  langMap: {
    iw: 'he'
  }
}

var defaults = {
  rate: 1.0,
  volume: 1.0
};


/**
 * HELPERS
 */

function parseQueryString(search) {
  if (search.charAt(0) != '?') throw new Error("Invalid argument");
  var queryString = {};
  search.substr(1).replace(/\+/g, '%20').split('&').forEach(function (tuple) {
    var tokens = tuple.split('=');
    queryString[decodeURIComponent(tokens[0])] = tokens[1] && decodeURIComponent(tokens[1]);
  })
  return queryString;
}

/**
 * SETTINGS
 */
function getSettings(names) {
  return new Promise(function (fulfill) {
    browser.storage.local.get(names || ["voiceName", "rate", "volume"], fulfill);
  });
}

function updateSettings(items) {
  return new Promise(function (fulfill) {
    browser.storage.local.set(items, fulfill);
  });
}

function setState(key, value) {
  var items = {};
  items[key] = value;
  return new Promise(function (fulfill) {
    browser.storage.local.set(items, fulfill);
  });
}


/**
 * VOICES
 */
function getVoices() {
  return getSettings(["gcpCreds"])
    .then(function (settings) {
      return Promise.all([
        googleTranslateTtsEngine.getVoices(),
      ])
    })
    .then(function (arr) {
      return Array.prototype.concat.apply([], arr);
    })
}

function isGoogleTranslate() {
  return true;
}

function isRemoteVoice() {
  return true;
}

function getSpeechVoice(voiceName, lang) {
  return Promise.all([getVoices()])
    .then(function (res) {
      var voices = res[0];
      var voice;
      if (voiceName) voice = findVoiceByName(voices, voiceName);
      if (!voice && lang) {
        voice = findVoiceByLang(voices.filter(negate(isRemoteVoice)), lang)
          || findVoiceByLang(voices.filter(isGoogleTranslate), lang)
          || findVoiceByLang(voices, lang);
        if (voice && isRemoteVoice()) voice = Object.assign({ autoSelect: true }, voice);
      }
      return voice;
    })
}

function findVoiceByName(voices, name) {
  for (var i = 0; i < voices.length; i++) if (voices[i].voiceName == name) return voices[i];
  return null;
}

function findVoiceByLang(voices, lang) {
  var speechLang = parseLang(lang);
  var match = {};
  voices.forEach(function (voice) {
    if (voice.lang) {
      var voiceLang = parseLang(voice.lang);
      if (voiceLang.lang == speechLang.lang) {
        //language matches
        if (voiceLang.rest == speechLang.rest) {
          //dialect matches, prefer female
          if (voice.gender == "female") match.first = match.first || voice;
          else match.second = match.second || voice;
        }
        else if (!voiceLang.rest) {
          //voice specifies no dialect
          match.third = match.third || voice;
        }
        else {
          //dialect mismatch, prefer en-US (if english)
          if (voiceLang.lang == 'en' && voiceLang.rest == 'us') match.fourth = match.fourth || voice;
          else match.sixth = match.sixth || voice;
        }
      }
    }
    else {
      //voice specifies no language, assume can handle any lang
      match.fifth = match.fifth || voice;
    }
  });
  return match.first || match.second || match.third || match.fourth || match.fifth || match.sixth;
}

function negate(pred) {
  return function () {
    return !pred.apply(this, arguments);
  }
}

function extraAction(action) {
  return function (data) {
    return Promise.resolve(action(data))
      .then(function () { return data })
  }
}

function parseLang(lang) {
  var tokens = lang.toLowerCase().replace(/_/g, '-').split(/-/, 2);
  return {
    lang: tokens[0],
    rest: tokens[1]
  };
}

function assert(truthy, message) {
  if (!truthy) throw new Error(message || "Assertion failed");
}

function urlEncode(oData) {
  if (oData == null) return null;
  var parts = [];
  for (var key in oData) parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(oData[key]));
  return parts.join("&");
}

function ajaxGet(sUrl) {
  return new Promise(ajaxGetCb.bind(null, sUrl));
}

function ajaxGetCb(sUrl, fulfill, reject) {
  var opts = typeof sUrl == "string" ? { url: sUrl } : sUrl;
  var xhr = new XMLHttpRequest();
  xhr.open("GET", opts.url, true);
  if (opts.headers) for (var name in opts.headers) xhr.setRequestHeader(name, opts.headers[name]);
  if (opts.responseType) xhr.responseType = opts.responseType;
  xhr.onreadystatechange = function () {
    if (xhr.readyState == XMLHttpRequest.DONE) {
      if (xhr.status == 200) fulfill(xhr.response);
      else if (reject) {
        var err = new Error("Failed to fetch " + opts.url.substr(0, 100));
        err.xhr = xhr;
        reject(err);
      }
    }
  };
  xhr.send(null);
}

function ajaxPost(sUrl, oData, sType) {
  return new Promise(function (fulfill, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", sUrl, true);
    xhr.setRequestHeader("Content-type", sType == "json" ? "application/json" : "application/x-www-form-urlencoded");
    xhr.onreadystatechange = function () {
      if (xhr.readyState == XMLHttpRequest.DONE) {
        if (xhr.status == 200) fulfill(xhr.responseText);
        else reject(new Error("Failed to fetch " + sUrl.substr(0, 100)));
      }
    };
    xhr.send(sType == "json" ? JSON.stringify(oData) : urlEncode(oData));
  })
}

function objectAssign(target) { // .length of function is 2
  'use strict';
  if (target == null) throw new TypeError('Cannot convert undefined or null to object');
  var to = Object(target);
  for (var index = 1; index < arguments.length; index++) {
    var nextSource = arguments[index];
    if (nextSource != null) { // Skip over if undefined or null
      for (var nextKey in nextSource) {
        // Avoid bugs when hasOwnProperty is shadowed
        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
          to[nextKey] = nextSource[nextKey];
        }
      }
    }
  }
  return to;
}

function getUniqueClientId() {
  return getSettings(["uniqueClientId"])
    .then(function (settings) {
      return settings.uniqueClientId || createId(8).then(extraAction(saveId));
    })
  function createId(len) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return Promise.resolve(text);
  }
  function saveId(id) {
    return updateSettings({ uniqueClientId: id });
  }
}

function hasPermissions(perms) {
  return Promise.resolve(true);
}

function getAuthToken(opts) {
  if (!opts) opts = {};
  return getSettings(["authToken"])
    .then(function (settings) {
      return settings.authToken || (opts.interactive ? interactiveLogin().then(extraAction(saveToken)) : null);
    })
  //Note: Cognito webAuthFlow is always interactive (if user already logged in, it shows button "Sign in as <email>" or  "Continue with Google/Facebook/etc")
  function interactiveLogin() {
    return new Promise(function (fulfill, reject) {
      if (!browser.identity || !browser.identity.launchWebAuthFlow) return fulfill(null);
      browser.identity.launchWebAuthFlow({
        interactive: true,
        url: config.webAppUrl + "/login.html?returnUrl=" + browser.identity.getRedirectURL()
      },
        function (responseUrl) {
          if (responseUrl) {
            var index = responseUrl.indexOf("?");
            var res = parseQueryString(responseUrl.substr(index));
            if (res.error) reject(new Error(res.error_description || res.error));
            else fulfill(res.token);
          }
          else {
            if (browser.runtime.lastError) reject(new Error(browser.runtime.lastError.message));
            else fulfill(null);
          }
        })
    })
  }
  function saveToken(token) {
    if (token) return updateSettings({ authToken: token });
  }
}

function promiseTimeout(millis, errorMsg, promise) {
  return new Promise(function (fulfill, reject) {
    var timedOut = false;
    var timer = setTimeout(onTimeout, millis);
    promise.then(onFulfill, onReject);

    function onFulfill(value) {
      if (timedOut) return;
      clearTimeout(timer);
      fulfill(value);
    }
    function onReject(err) {
      if (timedOut) return;
      clearTimeout(timer);
      reject(err);
    }
    function onTimeout() {
      timedOut = true;
      reject(new Error(errorMsg));
    }
  })
}

function truncateRepeatedChars(text, max) {
  var result = ""
  var startIndex = 0
  var count = 1
  for (var i = 1; i < text.length; i++) {
    if (text.charCodeAt(i) == text.charCodeAt(i - 1)) {
      count++
      if (count == max) result += text.slice(startIndex, i + 1)
    }
    else {
      if (count >= max) startIndex = i
      count = 1
    }
  }
  if (count < max) result += text.slice(startIndex)
  return result
}
