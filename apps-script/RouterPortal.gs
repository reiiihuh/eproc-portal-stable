function tryPortalRoute_(request) {
  request = request || {};
  var body = request.body && typeof request.body === "object" ? request.body : request;
  if (body.payload && typeof body.payload === "object") body = body.payload;
  var procurementResult = typeof tryProcurementRoute_ === "function" ? tryProcurementRoute_({ action: request.action || body.action, body: body }) : null;
  if (procurementResult) return procurementResult;
  var action = String(request.action || body.action || "").trim().toLowerCase();
  switch (action) {
    case "createdraft": return portalCreateDraft_(body);
    case "listmyrequests": return portalListMyRequests_(body);
    case "getrequestdetail": return portalGetRequestDetail_(body);
    case "uploaddocument": return portalUploadDocument_(body);
    case "submitrequest": return portalSubmitRequest_(body);
    default: return null;
  }
}

/*
Di dalam handleRequest_(request), letakkan ini SEBELUM switch(request.action):

var portalResult = tryPortalRoute_(request);
if (portalResult) return jsonResponse_(portalResult);

Posisi sebelum switch mencegah case legacy bernama sama mengambil request
portal lebih dulu. Jangan membuat doGet/doPost kedua. Endpoint health,
validateSchema, dan getPortalConfig yang sudah berfungsi tetap dipertahankan.
*/
