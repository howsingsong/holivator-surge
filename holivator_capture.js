const KEY = "holivator_auth";

/*
 * 讀取 Surge Module 參數
 */
function getArgument(name, defaultValue = "") {
  const result = {};

  if (typeof $argument === "string" && $argument.length > 0) {
    $argument.split("&").forEach(item => {
      const index = item.indexOf("=");

      if (index !== -1) {
        const key = item.substring(0, index);
        const value = item.substring(index + 1);

        result[key] = value;
      }
    });
  }

  return result[name] !== undefined
    ? result[name]
    : defaultValue;
}


/*
 * Token 更新通知開關
 */
const NOTIFY_TOKEN =
  getArgument("notify_token", "true") === "true";


try {

  const json =
    JSON.parse($response.body || "{}");


  if (
    json.code === 0 &&
    json.data &&
    json.data.access_token
  ) {

    /*
     * 讀取舊資料
     */
    let oldData = {};

    try {
      oldData = JSON.parse(
        $persistentStore.read(KEY) || "{}"
      );
    } catch (_) {}


    /*
     * 取得 Request Headers
     */
    const headers =
      $request.headers || {};


    function getHeader(name) {
      const key =
        Object.keys(headers).find(
          k =>
            k.toLowerCase() ===
            name.toLowerCase()
        );

      return key
        ? headers[key]
        : "";
    }


    /*
     * 儲存登入資料
     */
    const auth = {

      ...oldData,

      access_token:
        json.data.access_token,

      refresh_token:
        json.data.refresh_token ||
        oldData.refresh_token ||
        "",

      expires_in:
        json.data.expires_in || 0,

      refresh_expires_in:
        json.data.refresh_expires_in || 0,

      cookie:
        getHeader("cookie") ||
        oldData.cookie ||
        "",

      user_agent:
        getHeader("user-agent") ||
        oldData.user_agent ||
        "",

      referer:
        getHeader("referer") ||
        oldData.referer ||
        "https://holivator.de/miniapp",

      saved_at:
        Date.now()
    };


    const success =
      $persistentStore.write(
        JSON.stringify(auth),
        KEY
      );


    if (success) {

      console.log(
        "Holivator: Token 已更新"
      );


      if (NOTIFY_TOKEN) {

        $notification.post(
          "Holivator",
          "✅ 登入資料已更新",
          "Access Token / Refresh Token 已儲存"
        );

      }

    }

  }

} catch (error) {

  console.log(
    "Holivator Capture Error: " +
    error
  );

}


$done({});
