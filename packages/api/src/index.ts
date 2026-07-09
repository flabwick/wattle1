import { initCardTypes } from "@wattle/shared";
import { initOperations } from "./operations/init.js";
import { initProviders } from "./providers/init.js";
import { createApp } from "./app.js";

initCardTypes();
initOperations();
initProviders();

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`wattle api listening on http://localhost:${port}`);
});
