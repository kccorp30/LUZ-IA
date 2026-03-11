El contenido es generado por usuarios y no verificado.
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/webhook", (req, res) => {
  res.send("LUZ activa");
});

app.post("/webhook", async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body ? req.body.Body.trim() : "";

  if (!from || !body) return res.sendStatus(400);

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [
          { role: "user", content: body }
        ]
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.content[0].text;
    console.log("Respuesta de Claude:", reply);

    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`);

  } catch (err) {
    console.error("Error completo:", JSON.stringify(err.response ? err.response.data : err.message));
    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error: ${err.response ? JSON.stringify(err.response.data) : err.message}</Message></Response>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("LUZ corriendo en puerto " + PORT));
