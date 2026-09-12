const KEY = "holivator_auth";

const CHECKIN_URL =
  "https://holivator.de/api/v1/user/checkin";

const REFRESH_URL =
  "https://holivator.de/api/v1/auth/refresh";


/*
 * =========================
 * Module Arguments
 * =========================
 */

function getArgument(name, defaultValue = "") {

  const result = {};

  if (
    typeof $argument === "string" &&
    $argument.length > 0
  ) {

    $argument
      .split("&")
      .forEach(item => {

        const index =
          item.indexOf("=");

        if (index !== -1) {

          const key =
            item.substring(0, index);

          const value =
            item.substring(index + 1);

          result[key] =
            value;
        }

      });

  }

  return result[name] !== undefined
    ? result[name]
    : defaultValue;
}


const NOTIFY_SUCCESS =
  getArgument(
    "notify_success",
    "true"
  ) === "true";


const NOTIFY_FAILURE =
  getArgument(
    "notify_failure",
    "true"
  ) === "true";


/*
 * =========================
 * Notifications
 * =========================
 */

function notifySuccess(
  title,
  subtitle,
  message
) {

  if (!NOTIFY_SUCCESS) {
    return;
  }

  $notification.post(
    title,
    subtitle,
    message
  );

}


function notifyFailure(
  title,
  subtitle,
  message
) {

  if (!NOTIFY_FAILURE) {
    return;
  }

  $notification.post(
    title,
    subtitle,
    message
  );

}


/*
 * =========================
 * Load Auth
 * =========================
 */

let auth;

try {

  const raw =
    $persistentStore.read(KEY);


  if (!raw) {

    notifyFailure(
      "Holivator",
      "❌ 尚未取得登入資料",
      "請先從 Telegram 開啟一次 Holivator"
    );

    $done();
    return;
  }


  auth =
    JSON.parse(raw);


} catch (error) {

  notifyFailure(
    "Holivator",
    "❌ 登入資料錯誤",
    String(error)
  );

  $done();
  return;

}


/*
 * =========================
 * Save Auth
 * =========================
 */

function saveAuth() {

  return $persistentStore.write(
    JSON.stringify(auth),
    KEY
  );

}


/*
 * =========================
 * Common Headers
 * =========================
 */

function baseHeaders() {

  const headers = {

    "Accept":
      "*/*",

    "Content-Type":
      "application/json",

    "Origin":
      "https://holivator.de",

    "Referer":
      auth.referer ||
      "https://holivator.de/miniapp"

  };


  if (auth.cookie) {

    headers["Cookie"] =
      auth.cookie;

  }


  if (auth.user_agent) {

    headers["User-Agent"] =
      auth.user_agent;

  }


  return headers;
}


/*
 * =========================
 * Refresh Access Token
 * =========================
 */

function refreshAccessToken(
  callback
) {

  if (!auth.refresh_token) {

    callback(
      false,
      "找不到 Refresh Token"
    );

    return;
  }


  console.log(
    "Holivator: 嘗試更新 Access Token"
  );


  $httpClient.post(

    {

      url:
        REFRESH_URL,

      headers:
        baseHeaders(),

      body:
        JSON.stringify({

          refresh_token:
            auth.refresh_token

        }),

      timeout:
        20

    },


    function(
      error,
      response,
      body
    ) {


      if (error) {

        callback(
          false,
          String(error)
        );

        return;
      }


      const status =
        response.status ||
        response.statusCode;


      let json = null;


      try {

        json =
          JSON.parse(body);

      } catch (_) {}


      /*
       * Refresh 成功
       */
      if (
        status >= 200 &&
        status < 300 &&
        json &&
        json.code === 0 &&
        json.data &&
        json.data.access_token
      ) {


        auth.access_token =
          json.data.access_token;


        /*
         * 若網站未來採用
         * Refresh Token Rotation
         */
        if (
          json.data.refresh_token
        ) {

          auth.refresh_token =
            json.data.refresh_token;

        }


        auth.token_refreshed_at =
          Date.now();


        saveAuth();


        console.log(
          "Holivator: Access Token 更新成功"
        );


        callback(
          true,
          null
        );

        return;
      }


      const message =

        json?.message ||
        body ||
        `HTTP ${status}`;


      callback(
        false,
        String(message)
      );

    }

  );

}


/*
 * =========================
 * Check-in
 * =========================
 */

function checkin(
  allowRefresh = true
) {


  if (!auth.access_token) {

    notifyFailure(
      "Holivator",
      "❌ 找不到 Access Token",
      "請重新開啟 Telegram MiniApp"
    );

    $done();

    return;
  }


  const headers =
    baseHeaders();


  headers["Authorization"] =
    "Bearer " +
    auth.access_token;


  console.log(
    "Holivator: 開始執行簽到"
  );


  $httpClient.post(

    {

      url:
        CHECKIN_URL,

      headers:
        headers,

      timeout:
        20

    },


    function(
      error,
      response,
      body
    ) {


      if (error) {

        notifyFailure(
          "Holivator",
          "❌ 簽到連線失敗",
          String(error)
        );

        $done();

        return;
      }


      const status =
        response.status ||
        response.statusCode;


      /*
       * Access Token 過期
       */
      if (
        status === 401 &&
        allowRefresh
      ) {


        console.log(
          "Holivator: Access Token 已過期"
        );


        refreshAccessToken(

          function(
            success,
            message
          ) {


            if (success) {

              /*
               * 使用新的 Access Token
               * 再執行一次簽到
               */
              checkin(false);

            } else {

              notifyFailure(
                "Holivator",
                "❌ Token 更新失敗",
                message ||
                "請重新從 Telegram 開啟 Holivator"
              );


              $done();

            }

          }

        );


        return;
      }


      /*
       * Parse Response
       */
      let json = null;


      try {

        json =
          JSON.parse(body);

      } catch (_) {}


      /*
       * 簽到成功
       */
      if (
        status >= 200 &&
        status < 300 &&
        json &&
        json.code === 0
      ) {


        const data =
          json.data || {};


        const points =
          data.points_awarded ??
          "?";


        const bonus =
          data.total_bonus ??
          "?";


        const streak =
          data.streak ??
          "?";


        const total =
          data.total_points ??
          "?";


        const date =
          data.checkin_date ??
          "";


        notifySuccess(

          "✅ Holivator 簽到成功",

          `獲得 ${points} 積分`,

          `額外獎勵：${bonus}
連續簽到：${streak} 天
目前積分：${total}
${date}`

        );


        console.log(
          "Holivator: 簽到成功"
        );


        $done();

        return;
      }


      /*
       * 其他錯誤
       */
      const message =

        json?.message ||
        body ||
        `HTTP ${status}`;


      notifyFailure(

        "⚠️ Holivator 簽到異常",

        `HTTP ${status}`,

        String(message)
          .substring(0, 300)

      );


      $done();

    }

  );

}


/*
 * =========================
 * START
 * =========================
 */

checkin();
