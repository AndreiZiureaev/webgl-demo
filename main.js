'use strict';

main();

function $(query) {
    return document.querySelector(query);
}

function main() {
    const canvas = $('#canvas');
    const gl = canvas.getContext('webgl');

    if (gl === null) {
        alert("This browser or system doesn't support WebGL :(");
        return;
    }

    const fullscreen = $('#fullscreen');
    let fullscreenEvent = 'fullscreenchange';
    if (!canvas.requestFullscreen) {
        canvas.requestFullscreen = canvas.webkitRequestFullscreen;
        fullscreenEvent = 'webkitfullscreenchange';
    }
    function canvasIsFullscreen() {
        return document.fullscreenElement === canvas ||
            document.webkitFullscreenElement === canvas;
    }

    const hasMouseSupport = matchMedia('(any-pointer: fine)').matches;

    const programs = initPrograms(gl);
    const buffers = initBuffers(gl);
    const actions = new Set();

    const state = {
        actions,
        projectionMatrix: mat4.create(),
        viewProjectionMatrix: mat4.create(),
        translation: vec3.create(),
        displacement: vec3.create(),
        viewAngle: { horizontal: 0, vertical: 0 },
        maxSpeed: 0.02,
        mouseSensitivity: 0.002,
        touchSensitivity: 0.004,
        arrowSensitivity: 0.001,
        FOV: 90 * RADIANS_PER_DEGREE,
        aspectRatio: 1,
        zNear: 0.1,
        zFar: 1000,
        timeStamp: performance.now(),
        active: false,
        frameID: 0,

        touchControls: {
            dx: 0,
            dz: 0,
            movement: { touchID: null, x: 0, y: 0 },
            view: { touchID: null, horizontal: 0, vertical: 0 },
            midpoint: 0,
            movementRadiusPx: 0,
        },

        programs,
        buffers,
        facesAttribLocations: {
            position: gl.getAttribLocation(programs.faces, 'aPosition'),
            color: gl.getAttribLocation(programs.faces, 'aColor'),
        },
        facesUniformLocations: {
            matrix: gl.getUniformLocation(programs.faces, 'uMatrix'),
        },
        linesAttribLocations: {
            position: gl.getAttribLocation(programs.lines, 'aPosition'),
        },
        linesUniformLocations: {
            matrix: gl.getUniformLocation(programs.lines, 'uMatrix'),
        },
    };
    vec3.set(
        state.translation,
        -state.buffers.dimensions.widthBlocks / 2,
        -1.8,
        -state.buffers.dimensions.lengthBlocks / 2
    );

    resize(gl, state);
    window.addEventListener('resize', () => {
        resize(gl, state);

        if (!state.active) {
            render(state.timeStamp);
        }
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvas) {
            requestFocus();
            document.addEventListener('mousemove', handleMouseMove);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            loseFocus();
        }
    });

    document.addEventListener(fullscreenEvent, () => {
        if (canvasIsFullscreen()) {
            requestFocus();
        } else {
            loseFocus();
        }
    });

    canvas.addEventListener('click', () => {
        if (hasMouseSupport) {
            if (document.pointerLockElement !== canvas) {
                canvas.requestPointerLock();
            }
        } else {
            if (!canvasIsFullscreen()) {
                canvas.requestFullscreen();
            }
        }
    });

    fullscreen.addEventListener('click', () => {
        canvas.requestFullscreen();
    });

    // Can be called many times in a row because the event listeners are only
    // added once (handlers are function references, so they are considered the
    // same in each call). The frameID check prevents multiple render calls per
    // frame.
    function requestFocus() {
        fullscreen.style.visibility = 'hidden';
        canvas.style.touchAction = 'none';
        document.addEventListener('keyup', handleKeyUp);
        document.addEventListener('keydown', handleKeyDown);

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);
        canvas.addEventListener('touchcancel', handleTouchEnd);

        state.active = true;
        if (state.frameID === 0) state.frameID = requestAnimationFrame(render);
    }

    function loseFocus() {
        cancelAnimationFrame(state.frameID);
        state.frameID = 0;
        state.active = false;

        canvas.removeEventListener('touchcancel', handleTouchEnd);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.removeEventListener('touchstart', handleTouchStart, { passive: false });

        // Reset both touch trackers
        handleTouchEndMovement();
        handleTouchEndView();

        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        canvas.style.touchAction = 'auto';
        fullscreen.style.visibility = 'visible';

        // Required by Edge.
        document.exitPointerLock();
    }

    function handleTouchStart(event) {
        for (let touch of event.changedTouches) {
            if (touch.clientX <= state.touchControls.midpoint) {
                handleTouchStartMovement(touch);
            } else {
                handleTouchStartView(touch);
            }
        }

        event.preventDefault();
    }

    function handleTouchStartMovement(touch) {
        if (state.touchControls.movement.touchID === null) {
            state.touchControls.movement.touchID = touch.identifier;
            state.touchControls.movement.x = touch.clientX;
            state.touchControls.movement.y = touch.clientY;
        }
    }

    function handleTouchStartView(touch) {
        if (state.touchControls.view.touchID === null) {
            state.touchControls.view.touchID = touch.identifier;
            state.touchControls.view.horizontal = touch.clientX;
            state.touchControls.view.vertical = touch.clientY;
        }
    }

    function handleTouchMove(event) {
        for (let touch of event.changedTouches) {
            if (touch.identifier === state.touchControls.movement.touchID) {
                handleTouchMoveMovement(touch);
            } else if (touch.identifier === state.touchControls.view.touchID) {
                handleTouchMoveView(touch);
            }
        }

        event.preventDefault();
    }

    function handleTouchMoveMovement(touch) {

        // Normalized offsets
        let dx = (touch.clientX - state.touchControls.movement.x) / state.touchControls.movementRadiusPx;
        let dz = (touch.clientY - state.touchControls.movement.y) / state.touchControls.movementRadiusPx;

        const radius = sqrt(dx * dx + dz * dz);

        // Cap the radius at 1
        if (radius > 1) {
            const angle = atan2(dz, dx);
            dx = cos(angle);
            dz = sin(angle);
        }

        state.touchControls.dx = dx;
        state.touchControls.dz = dz;
    }

    function handleTouchMoveView(touch) {
        updateViewAngle(
            state,
            -(touch.clientX - state.touchControls.view.horizontal) * state.touchSensitivity,
            -(touch.clientY - state.touchControls.view.vertical) * state.touchSensitivity
        );

        state.touchControls.view.horizontal = touch.clientX;
        state.touchControls.view.vertical = touch.clientY;
    }

    function handleTouchEnd(event) {
        for (let touch of event.changedTouches) {
            if (touch.identifier === state.touchControls.movement.touchID) {
                handleTouchEndMovement();
            } else if (touch.identifier === state.touchControls.view.touchID) {
                handleTouchEndView();
            }
        }
    }

    function handleTouchEndMovement() {
        state.touchControls.movement.touchID = null;
        state.touchControls.dx = 0;
        state.touchControls.dz = 0;
    }

    function handleTouchEndView() {
        state.touchControls.view.touchID = null;
    }

    function handleKeyDown(event) {
        actions.add(event.keyCode);
        event.preventDefault();
    }

    function handleKeyUp(event) {
        actions.delete(event.keyCode);
    }

    function handleMouseMove(event) {
        updateViewAngle(
            state,
            -event.movementX * state.mouseSensitivity,
            -event.movementY * state.mouseSensitivity
        );
    }

    function render(timeStamp) {
        const elapsed = timeStamp - state.timeStamp;
        state.timeStamp = timeStamp;

        handleActions(state, elapsed);
        calculateViewProjectionMatrix(state);
        drawFaces(gl, state);
        drawLines(gl, state);

        if (state.active) state.frameID = requestAnimationFrame(render);
    }

    render(state.timeStamp);
}

function resize(gl, state) {
    const viewportWidth = gl.canvas.clientWidth;
    const viewportHeight = gl.canvas.clientHeight;

    state.aspectRatio = viewportWidth / viewportHeight;
    calculateProjectionMatrix(state);

    state.touchControls.midpoint = floor(viewportWidth / 2);
    state.touchControls.movementRadiusPx = floor(viewportWidth / 6);

    if (viewportWidth !== gl.canvas.width) {
        gl.canvas.width = viewportWidth;
    }

    if (viewportHeight !== gl.canvas.height) {
        gl.canvas.height = viewportHeight;
    }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

function updateViewAngle(state, dHorizontalAngle, dVerticalAngle) {
    state.viewAngle.horizontal += dHorizontalAngle;
    if (state.viewAngle.horizontal > PI) {
        state.viewAngle.horizontal -= TAU;
    } else if (state.viewAngle.horizontal < -PI) {
        state.viewAngle.horizontal += TAU;
    }

    state.viewAngle.vertical += dVerticalAngle;
    if (state.viewAngle.vertical > HALF_PI) {
        state.viewAngle.vertical = HALF_PI;
    } else if (state.viewAngle.vertical < -HALF_PI) {
        state.viewAngle.vertical = -HALF_PI;
    }
}

function handleActions(state, elapsed) {
    let dx = 0;
    let dz = 0;
    let dHorizontalAngle = 0;
    let dVerticalAngle = 0;

    for (let action of state.actions) {
        switch (action) {
            case FORWARD:
                dz--;
                break;
            case BACK:
                dz++;
                break;
            case LEFT:
                dx--;
                break;
            case RIGHT:
                dx++;
                break;
            case VIEW_UP:
                dVerticalAngle++;
                break;
            case VIEW_DOWN:
                dVerticalAngle--;
                break;
            case VIEW_LEFT:
                dHorizontalAngle++;
                break;
            case VIEW_RIGHT:
                dHorizontalAngle--;
                break;
        }
    }

    if (dHorizontalAngle !== 0 || dVerticalAngle !== 0) {
        const angle = atan2(dVerticalAngle, dHorizontalAngle);
        dHorizontalAngle = cos(angle);
        dVerticalAngle = sin(angle);

        updateViewAngle(
            state,
            dHorizontalAngle * state.arrowSensitivity * elapsed,
            dVerticalAngle * state.arrowSensitivity * elapsed
        );
    }

    if (dx !== 0 || dz !== 0) {
        const angle = atan2(dz, dx);
        dx = cos(angle);
        dz = sin(angle);

        displace(state, dx, dz, state.maxSpeed * elapsed);
    }

    if (state.touchControls.dx !== 0 || state.touchControls.dz !== 0) {
        displace(
            state,
            state.touchControls.dx,
            state.touchControls.dz,
            state.maxSpeed * elapsed
        );
    }
}

function displace(state, dx, dz, multiplier) {
    vec3.set(
        state.displacement,
        dx * multiplier,
        0,
        dz * multiplier
    );
    vec3.rotateX(
        state.displacement,
        state.displacement,
        ORIGIN,
        state.viewAngle.vertical
    );
    vec3.rotateY(
        state.displacement,
        state.displacement,
        ORIGIN,
        state.viewAngle.horizontal
    );
    vec3.subtract(
        state.translation,
        state.translation,
        state.displacement
    );
}

function calculateProjectionMatrix(state) {
    mat4.perspective(
        state.projectionMatrix,
        state.FOV,
        state.aspectRatio,
        state.zNear,
        state.zFar
    );
}

function calculateViewProjectionMatrix(state) {
    mat4.rotateX(
        state.viewProjectionMatrix,
        state.projectionMatrix,
        -state.viewAngle.vertical
    );
    mat4.rotateY(
        state.viewProjectionMatrix,
        state.viewProjectionMatrix,
        -state.viewAngle.horizontal
    );
    mat4.translate(
        state.viewProjectionMatrix,
        state.viewProjectionMatrix,
        state.translation
    );
}

function drawFaces(gl, state) {
    gl.useProgram(state.programs.faces);

    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.position);
    gl.vertexAttribPointer(
        state.facesAttribLocations.position,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );
    gl.enableVertexAttribArray(
        state.facesAttribLocations.position
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.color);
    gl.vertexAttribPointer(
        state.facesAttribLocations.color,
        3,
        gl.UNSIGNED_BYTE,
        true,
        0,
        0
    );
    gl.enableVertexAttribArray(
        state.facesAttribLocations.color
    );

    gl.uniformMatrix4fv(
        state.facesUniformLocations.matrix,
        false,
        state.viewProjectionMatrix
    );

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.buffers.element.buffer);

    gl.clearColor(0.5, 0.8, 0.9, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(
        gl.TRIANGLES,
        state.buffers.element.length,
        gl.UNSIGNED_SHORT,
        0
    );

    gl.disableVertexAttribArray(
        state.facesAttribLocations.position
    );
    gl.disableVertexAttribArray(
        state.facesAttribLocations.color
    );
}

function drawLines(gl, state) {
    gl.useProgram(state.programs.lines);

    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.position);
    gl.vertexAttribPointer(
        state.linesAttribLocations.position,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );
    gl.enableVertexAttribArray(
        state.linesAttribLocations.position
    );

    gl.uniformMatrix4fv(
        state.linesUniformLocations.matrix,
        false,
        state.viewProjectionMatrix
    );

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.buffers.lineElement.buffer);

    gl.disable(gl.DEPTH_TEST);
    gl.drawElements(
        gl.LINES,
        state.buffers.lineElement.length,
        gl.UNSIGNED_SHORT,
        0
    );

    gl.disableVertexAttribArray(
        state.linesAttribLocations.position
    );
}
