console.log("Ruta de productos cargada");
const express = require("express");
const router = express.Router();
const connection = require("../config/db.js");

router.get("/", (req, res) => {
  const sql = "SELECT * FROM productos";

  connection.query(sql, (error, results) => {
    if (error) {
      console.log("Error al obtener productos:", error);
      return res.status(500).json({ mensaje: "Error al obtener los productos" });
    }

    res.json(results);
  });
});

module.exports = router;

