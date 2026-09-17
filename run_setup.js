function runSetup() {
  var res = setupTelegramWebhook();
  console.log("Setup webhook result: " + JSON.stringify(res));
  return JSON.stringify(res);
}
