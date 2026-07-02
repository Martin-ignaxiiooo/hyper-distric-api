const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send("Servidor de Hyper Distric funcionando correctamente");
});

module.exports = router;

