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

// OBTENER MESAS
app.get("/mesas", async (req, res) => {
  const { data, error } = await supabase.from("mesas").select("*");
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// LISTAR RESERVAS
app.get("/reservas", async (req, res) => {
  const { data, error } = await supabase
    .from("reservas")
    .select("*")
    .order("hora", { ascending: true });

  if (error) return res.status(500).json({ error });
  res.json(data);
});

// ESTADO DE MESAS (CLAVE PARA FRONTEND)
app.post("/estado-mesas", async (req, res) => {
  try {
    const { fecha, hora } = req.body;

    const [h, m] = hora.split(":").map(Number);
    const horaActual = h * 60 + m;

    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .eq("estado", "confirmada");

    const { data: mesas } = await supabase.from("mesas").select("*");

    const resultado = mesas.map((mesa) => {
      let ocupada = false;

      for (const r of reservas) {
        if (r.mesa_id !== mesa.id) continue;

        const [rh, rm] = r.hora.split(":").map(Number);
        const inicio = rh * 60 + rm;
        const fin = inicio + (r.duracion_minutos || 90);

        if (horaActual >= inicio && horaActual < fin) {
          ocupada = true;
          break;
        }
      }

      return {
        mesa_id: mesa.id,
        capacidad: mesa.capacidad,
        ocupada,
      };
    });

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DISPONIBILIDAD
app.post("/availability", async (req, res) => {
  try {
    const { fecha, hora, personas } = req.body;

    const [h, m] = hora.split(":").map(Number);
    const horaActual = h * 60 + m;

    const { data: mesas } = await supabase
      .from("mesas")
      .select("*")
      .gte("capacidad", personas);

    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .eq("estado", "confirmada");

    for (const mesa of mesas) {
      let ocupada = false;

      for (const r of reservas) {
        if (r.mesa_id !== mesa.id) continue;

        const [rh, rm] = r.hora.split(":").map(Number);
        const inicio = rh * 60 + rm;
        const fin = inicio + (r.duracion_minutos || 90);

        if (horaActual >= inicio && horaActual < fin) {
          ocupada = true;
          break;
        }
      }

      if (!ocupada) {
        return res.json({
          disponible: true,
          mesa_id: mesa.id,
        });
      }
    }

    res.json({ disponible: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESERVAR (ANTI-OVERBOOKING REAL)
app.post("/reservar", async (req, res) => {
  try {
    const { nombre, telefono, fecha, hora, personas } = req.body;

    const [h, m] = hora.split(":").map(Number);
    const horaNueva = h * 60 + m;

    const { data: mesas } = await supabase
      .from("mesas")
      .select("*")
      .gte("capacidad", personas);

    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .eq("estado", "confirmada");

    for (const mesa of mesas) {
      let conflicto = false;

      for (const r of reservas) {
        if (r.mesa_id !== mesa.id) continue;

        const [rh, rm] = r.hora.split(":").map(Number);
        const inicio = rh * 60 + rm;
        const fin = inicio + (r.duracion_minutos || 90);

        if (horaNueva >= inicio && horaNueva < fin) {
          conflicto = true;
          break;
        }
      }

      if (!conflicto) {
        const { error } = await supabase.from("reservas").insert([
          {
            nombre,
            telefono,
            fecha,
            hora,
            personas,
            mesa_id: mesa.id,
            estado: "confirmada",
            duracion_minutos: 90,
          },
        ]);

        if (error) throw error;

        return res.json({
          success: true,
          message: "Reserva confirmada",
          mesa_id: mesa.id,
        });
      }
    }

    res.json({ error: "No hay mesas disponibles en ese horario" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});