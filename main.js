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
    if (!canvas.requestFullscreen) {
        canvas.requestFullscreen = canvas.webkitRequestFullscreen;
    }

    const mouseSupport = matchMedia('(any-pointer: fine)').matches;

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
        arrowSensitivity: 0.001,
        FOV: 90 * RADIANS_PER_DEGREE,
        aspectRatio: 1,
        zNear: 0.1,
        zFar: 200,
        timeStamp: performance.now(),
        active: false,
        frameID: 0,

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

    if (mouseSupport) document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvas) {
            requestFocus();
        } else {
            loseFocus();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (
            document.fullscreenElement === canvas ||
            document.webkitFullscreenElement === canvas
        ) {
            requestFocus();
        } else {
            loseFocus();
        }
    });

    // Handle all clicks on the canvas, but only request pointer lock if a
    // pointer is supported.
    canvas.addEventListener('click', () => {
        if (mouseSupport && document.pointerLockElement !== canvas) {
            canvas.requestPointerLock();
        }
    });

    fullscreen.addEventListener('click', () => {
        canvas.requestFullscreen();
    });

    function requestFocus() {
        fullscreen.style.visibility = 'hidden';
        document.addEventListener('keyup', handleKeyUp);
        document.addEventListener('keydown', handleKeyDown);

        if (mouseSupport) {
            if (document.pointerLockElement !== canvas) {
                canvas.requestPointerLock();
            }

            document.addEventListener('mousemove', handleMouseMove);
        }

        state.active = true;
        if (state.frameID === 0) state.frameID = requestAnimationFrame(render);

    }

    function loseFocus() {
        cancelAnimationFrame(state.frameID);
        state.frameID = 0;
        state.active = false;

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        fullscreen.style.visibility = 'visible';
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

        vec3.set(
            state.displacement,
            dx * state.maxSpeed * elapsed,
            0,
            dz * state.maxSpeed * elapsed
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
