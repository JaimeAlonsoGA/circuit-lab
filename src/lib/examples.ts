import type { CodeLang } from './types';

export interface Example { name: string; lang: CodeLang; source: string }

export const EXAMPLES: Example[] = [
  { name: 'Blink', lang: 'arduino', source: `// Blink the LED on pin 13
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
` },
  { name: 'Button → LED', lang: 'arduino', source: `const int BUTTON = 2;
const int LED = 13;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED, pressed ? HIGH : LOW);
  if (pressed) Serial.println("pressed!");
  delay(20);
}
` },
  { name: 'Fade (PWM)', lang: 'arduino', source: `int brightness = 0;
int step = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, brightness);
  brightness = brightness + step;
  if (brightness <= 0 || brightness >= 255) step = -step;
  delay(30);
}
` },
  { name: 'Knob → Serial', lang: 'arduino', source: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);
  float volts = raw * 5.0 / 1023.0;
  Serial.print("A0 = ");
  Serial.print(raw);
  Serial.print("  (");
  Serial.print(volts);
  Serial.println(" V)");
  delay(250);
}
` },
  { name: 'Servo knob', lang: 'arduino', source: `#include <Servo.h>

Servo arm;

void setup() {
  arm.attach(9);
}

void loop() {
  int raw = analogRead(A0);
  arm.write(map(raw, 0, 1023, 0, 180));
  delay(15);
}
` },
  { name: 'OLED hello', lang: 'arduino', source: `#include <Wire.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
int counter = 0;

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}

void loop() {
  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println("Hello!");
  display.setTextSize(1);
  display.print("count: ");
  display.println(counter++);
  display.drawRect(0, 40, 128, 20, WHITE);
  display.fillRect(2, 42, counter % 124, 16, WHITE);
  display.display();
  delay(100);
}
` },
  { name: 'Melody', lang: 'arduino', source: `int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};

void setup() {
  pinMode(8, OUTPUT);
}

void loop() {
  for (int i = 0; i < 8; i++) {
    tone(8, notes[i]);
    delay(200);
  }
  noTone(8);
  delay(800);
}
` },
  { name: 'Traffic light', lang: 'arduino', source: `#define RED 12
#define YELLOW 11
#define GREEN 10

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void light(int pin, int ms) {
  digitalWrite(pin, HIGH);
  delay(ms);
  digitalWrite(pin, LOW);
}

void loop() {
  light(GREEN, 2000);
  light(YELLOW, 600);
  light(RED, 2000);
}
` },
  { name: 'Blink (JavaScript)', lang: 'js', source: `// Plain JavaScript with the Arduino API. await delay(...) pauses in simulated time.
function setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

async function loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  await delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  await delay(250);
  console.log('t =', millis(), 'ms');
}
` },
];
