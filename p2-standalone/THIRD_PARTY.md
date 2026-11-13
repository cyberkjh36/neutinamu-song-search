# Build dependencies

Dependencies are downloaded by the build; their source is not copied into this directory.

| Component | Version | Source / license |
|---|---|---|
| PlatformIO Core | 6.1.18 | https://github.com/platformio/platformio-core — Apache-2.0 |
| PlatformIO Espressif32 | 6.9.0 | https://github.com/platformio/platform-espressif32 — Apache-2.0 |
| Arduino ESP32 | 2.0.17 (selected by the platform) | https://github.com/espressif/arduino-esp32/tree/2.0.17 — LGPL-2.1 and component licenses |
| IRremoteESP8266 | 2.8.6 | https://github.com/crankyoldgit/IRremoteESP8266/tree/v2.8.6 — LGPL-2.1 |
| ArduinoJson | 6.21.5 | https://github.com/bblanchon/ArduinoJson/tree/v6.21.5 — MIT |
| certifi / Mozilla root certificates | 2025.8.3 | https://github.com/certifi/python-certifi/tree/2025.08.03 — MPL-2.0 |
| cryptography (build tool) | 45.0.7 | https://github.com/pyca/cryptography — Apache-2.0 / BSD-3-Clause |
| Playwright (UI tests only) | 1.56.1 | https://github.com/microsoft/playwright — Apache-2.0 |

The generated CA bundle uses Espressif's subject/public-key format documented in
https://github.com/espressif/arduino-esp32/blob/2.0.17/tools/gen_crt_bundle.py (Apache-2.0).
Keep the build sources and pinned dependency references with distributed firmware so it can be rebuilt.
