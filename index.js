require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Servidor funcionando");
});

// 🔍 DISPONIBILIDAD
app.post("/availability", async (req, res) => {
  try {
    const { fecha, hora, personas } = req.body;

    const { data: mesas, error } = await supabase
      .from("mesas")
      .select("*")
      .gte("capacidad", personas);

    if (error) throw error;

    if (!mesas || mesas.length === 0) {
      return res.json({ disponible: false });
    }

    res.json({ disponible: true, mesa_id: mesas[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESERVAR (EL IMPORTANTE)
app.post("/reservar", async (req, res) => {
  try {
    const { nombre, telefono, fecha, hora, personas } = req.body;

    // 1. Buscar mesa disponible
    const { data: mesas, error: errorMesas } = await supabase
      .from("mesas")
      .select("*")
      .gte("capacidad", personas);

    if (errorMesas) throw errorMesas;

    if (!mesas || mesas.length === 0) {
      return res.json({ error: "No hay mesas disponibles" });
    }

    const mesa = mesas[0];

    // 2. Guardar reserva
    const { error: errorReserva } = await supabase
      .from("reservas")
      .insert([
        {
          nombre,
          telefono,
          fecha,
          hora,
          personas,
          mesa_id: mesa.id
        }
      ]);

    if (errorReserva) throw errorReserva;

    res.json({
      success: true,
      mensaje: "Reserva confirmada",
      mesa_id: mesa.id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});