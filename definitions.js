'use strict';

const { mat4, vec3 } = glMatrix;
const { PI, atan2, sin, cos, random } = Math;

const TAU = 2 * PI;
const HALF_PI = PI / 2;
const RADIANS_PER_DEGREE = PI / 180;
const DEGREES_PER_RADIAN = 180 / PI;

const ORIGIN = vec3.create();

const KEY_W = 87;
const KEY_S = 83;
const KEY_A = 65;
const KEY_D = 68;
const ARROW_UP = 38;
const ARROW_DOWN = 40;
const ARROW_LEFT = 37;
const ARROW_RIGHT = 39;

const FORWARD = KEY_W;
const BACK = KEY_S;
const LEFT = KEY_A;
const RIGHT = KEY_D;
const VIEW_UP = ARROW_UP;
const VIEW_DOWN = ARROW_DOWN;
const VIEW_LEFT = ARROW_LEFT;
const VIEW_RIGHT = ARROW_RIGHT;
