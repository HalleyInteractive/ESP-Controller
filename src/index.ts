/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import {ESP32Controller} from './esp32-controller';

const esp32Controller: ESP32Controller = new ESP32Controller();

async function initESP32Controller() {
  await esp32Controller.init();
}

async function stopESP32Controller() {
  await esp32Controller.stop();
}

document.getElementById('btn-connect')?.addEventListener('click', () => {
  initESP32Controller().catch(error => {
    console.error(error);
  });
});

document.getElementById('btn-disconnect')?.addEventListener('click', () => {
  stopESP32Controller().catch(error => {
    console.error(error);
  });
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  esp32Controller.reset();
});

document.getElementById('btn-sync')?.addEventListener('click', () => {
  esp32Controller.sync().catch(error => {
    console.log('ERROR', error);
  });
});

document.getElementById('btn-chip')?.addEventListener('click', () => {
  esp32Controller.readChipFamily().catch(error => {
    console.log('ERROR', error);
  });
});

document.getElementById('btn-reframe')?.addEventListener('click', () => {
  esp32Controller.reframe();
});

document.getElementById('btn-flash')?.addEventListener('click', () => {
  esp32Controller.flashImage().catch(error => {
    console.log('ERROR', error);
  });
});