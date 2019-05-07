'use strict';

function initPrograms(gl) {
    const vsSourceFaces = `
        attribute vec4 aPosition;
        attribute vec4 aColor;

        uniform mat4 uMatrix;

        varying vec4 vColor;

        void main() {
            vColor = aColor;
            gl_Position = uMatrix * aPosition;
        }
    `;
    const fsSourceFaces = `
        varying highp vec4 vColor;

        void main() {
            gl_FragColor = vColor;
        }
    `;
    const vsSourceLines = `
        attribute vec4 aPosition;

        uniform mat4 uMatrix;

        void main() {
            gl_Position = uMatrix * aPosition;
        }
    `;
    const fsSourceLines = `
        void main() {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    `;

    return {
        faces: loadProgram(gl, vsSourceFaces, fsSourceFaces),
        lines: loadProgram(gl, vsSourceLines, fsSourceLines),
    };
}

function loadProgram(gl, vsSource, fsSource) {
    const vs = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
        return null;
    }

    return program;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function initBuffers(gl) {
    const widthBlocks = 66;
    const lengthBlocks = 66;
    const verticesPerRow = widthBlocks * 4;
    const dimensions = {
        widthBlocks,
        lengthBlocks,
        verticesPerRow,
        totalVertices: verticesPerRow * lengthBlocks,
        widthElements: (widthBlocks - 1) * 24,
    };
    const element = initElementBuffer(gl, dimensions);

    return {
        dimensions,
        element,
        position: initPositionBuffer(gl, dimensions),
        color: initColorBuffer(gl, dimensions),
        lineElement: initLineElementBuffer(gl, dimensions, element.elements),
    };
}


function initPositionBuffer(gl, dimensions) {
    const positionBuffer = gl.createBuffer();
    const positions = [];

    for (let z = 0; z < dimensions.lengthBlocks; z++) {
        const z1 = z + 0.5;

        for (let x = 0; x < dimensions.widthBlocks; x++) {
            const x1 = x + 0.5;

            positions.push(
                x,  0, z,
                x1, 0, z,
                x,  0, z1,
                x1, 0, z1
            );
        }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(positions),
        gl.STATIC_DRAW
    );

    return positionBuffer;
}

function initColorBuffer(gl, dimensions) {
    const colorBuffer = gl.createBuffer();
    const colors = [];

    for (let i = 0; i < dimensions.totalVertices; i++) {
        colors.push(
            130, 224, 30
        );
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array(colors),
        gl.STATIC_DRAW
    );

    return colorBuffer;
}

function initElementBuffer(gl, dimensions) {
    const elementBuffer = gl.createBuffer();
    const elements = [];

    for (let z = 0; z < dimensions.lengthBlocks - 1; z++) {
        for (let x = 0; x < dimensions.widthBlocks - 1; x++) {
            bufferElements(elements, dimensions, x, z);
        }
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(elements),
        gl.STATIC_DRAW
    );

    return {
        buffer: elementBuffer,
        length: elements.length,
        elements,
    };
}

function bufferElements(elements, dimensions, x, z) {
    const i = z * dimensions.verticesPerRow + x * 4;
    const ip1 = i + 1;
    const ip2 = i + 2;
    const ip3 = i + 3;
    const ip4 = i + 4;
    const ip6 = i + 6;
    const j = i + dimensions.verticesPerRow;
    const jp1 = j + 1;
    const jp4 = j + 4;

    elements.push(
        ip3, ip1, i,
        ip3, ip4, ip1,
        ip3, ip6, ip4,
        ip3, jp4, ip6,
        ip3, jp1, jp4,
        ip3, j, jp1,
        ip3, ip2, j,
        ip3, i, ip2
    );
}

function initLineElementBuffer(gl, dimensions, triangleElements) {
    const lineElementBuffer = gl.createBuffer();
    const elements = [];

    for (let z = 0; z < dimensions.lengthBlocks - 1; z += 16) {
        for (let x = 0; x < dimensions.widthBlocks - 1; x += 16) {
            bufferLineElements(elements, dimensions, triangleElements, x, z);
        }
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineElementBuffer);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(elements),
        gl.STATIC_DRAW
    );

    return {
        buffer: lineElementBuffer,
        length: elements.length,
    };
}

function bufferLineElements(elements, dimensions, triangleElements, x, z) {
    const start = z * dimensions.widthElements + x * 24;
    const end = start + 24;

    for (let i = start; i < end; i += 3) {
        const ip1 = i + 1;
        const ip2 = i + 2;

        elements.push(
            triangleElements[i], triangleElements[ip1],
            triangleElements[ip1], triangleElements[ip2]
        );
    }
}
