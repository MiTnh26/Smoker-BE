exports.success = (message, data = null) => ({
    status: "success",
    message,
    data,
  });
  
  exports.error = (message, code = 400) => ({
    status: "error",
    message,
    code,
  });
  