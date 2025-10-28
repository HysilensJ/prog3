/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const WIN_Z = 0;  // default graphics window z coord in world space
const WIN_LEFT = 0; const WIN_RIGHT = 1;  // default left and right x coords in world space
const WIN_BOTTOM = 0; const WIN_TOP = 1;  // default top and bottom y coords in world space
const INPUT_TRIANGLES_URL = "https://ncsucgclass.github.io/prog3/triangles2.json"; // triangles file loc
const NEW_INPUT_TRIANGLES_URL = "https://hysilensj.github.io/prog2/triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = "https://ncsucgclass.github.io/prog2/spheres.json"; // spheres file loc
var canvas;
var Eye = new vec3.fromValues(0.5,0.5,-0.5); // default eye position in world space
var lookAt = new vec3.fromValues(0.5, 0.5, 1.0);
var viewUp = new vec3.fromValues(0.0, 1.0, 0.0);
var view = mat4.create();
var perspective = mat4.create();
var selectionON = false;
var selectionIndex = 0;
var indexInfo = [];
var materials = [];

/* webgl globals */
var gl = null; // the all powerful gl object. It's all here folks!
var vertexBuffer; // this contains vertex coordinates in triples
var triangleBuffer; // this contains indices into vertexBuffer in triples
var colorBuffer; // this contains colors
var normalsBuffer; // this contains the triangle normals used for lighting
var triBufferSize = 0; // the number of indices in the triangle buffer
var vertexPositionAttrib; // where to put position for vertex shader
var vertexNormalAttrib; // where to put normals for fragment shader
var viewMatrixUniform; // view matrix used for transforms
var perspMatrixUniform; // perspective matrix used for transforms
var TriMatrixUniform; // matrix for individual triangle transforms

class Transform {
  constructor() {
    this.center = new vec3.fromValues(0.0, 0.0, 0.0);
    this.translation = new vec3.fromValues(0.0, 0.0, 0.0);
    this.scale = new vec3.fromValues(1.0, 1.0, 1.0);
    this.rotation = new vec3.fromValues(0.0, 0.0, 0.0);
    this.rotateBy = 0;
  }

  getTransform() {
    var translateMatrix = mat4.create();
    var centerMatrix = mat4.create();
    var originMatrix = mat4.create();
    var scaleMatrix = mat4.create();
    var transformMatrix = mat4.create();
    var rotationX = mat4.create();
    var rotationY = mat4.create();
    var rotationZ = mat4.create();
    var rotationMatrix = mat4.create();
    mat4.fromTranslation(centerMatrix, this.center);
    mat4.fromTranslation(originMatrix, vec3.negate(vec3.create(), this.center));
    mat4.fromTranslation(translateMatrix, this.translation);
    mat4.fromScaling(scaleMatrix, this.scale);
    mat4.fromXRotation(rotationX, this.rotation[0]);
    mat4.fromYRotation(rotationY, this.rotation[1]);
    mat4.fromZRotation(rotationZ, this.rotation[2]);
    mat4.multiply(rotationMatrix, rotationZ, rotationY);
    mat4.multiply(rotationMatrix, rotationMatrix, rotationX);
  
    mat4.multiply(transformMatrix, transformMatrix, translateMatrix);
    mat4.multiply(transformMatrix, transformMatrix, centerMatrix);
    mat4.multiply(transformMatrix, transformMatrix, rotationMatrix);
    mat4.multiply(transformMatrix, transformMatrix, scaleMatrix);
    mat4.multiply(transformMatrix, transformMatrix, originMatrix);
    
    return transformMatrix;
  }
}

var transforms = []; // 1D list of transform objects for each triangle


// ASSIGNMENT HELPER FUNCTIONS

// Change the selection index
function changeSelection(type) {

  transforms[selectionIndex].scale[0] = 1.0;
  transforms[selectionIndex].scale[1] = 1.0;
  transforms[selectionIndex].scale[2] = 1.0;

  if (type == 1) {
    if (selectionIndex + 1 >= transforms.length) {
      selectionIndex = 0;
    }
    else {
      selectionIndex++;
    }
  }
  else if (type == -1) {
    if (selectionIndex - 1 < 0) {
      selectionIndex = transforms.length - 1;
    }
    else {
      selectionIndex--;
    }
  }
  else {
    if (selectionON) {
      transforms[selectionIndex].scale[0] = 1.2;
      transforms[selectionIndex].scale[1] = 1.2;
      transforms[selectionIndex].scale[2] = 1.2;
    }
    else {
      transforms[selectionIndex].scale[0] = 1.0;
      transforms[selectionIndex].scale[1] = 1.0;
      transforms[selectionIndex].scale[2] = 1.0;
      return;
    }
  }

  transforms[selectionIndex].scale[0] = 1.2;
  transforms[selectionIndex].scale[1] = 1.2;
  transforms[selectionIndex].scale[2] = 1.2;
}

// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    try {
        if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
            throw "getJSONFile: parameter not a string";
        else {
            var httpReq = new XMLHttpRequest(); // a new http request
            httpReq.open("GET",url,false); // init the request
            httpReq.send(null); // send the request
            var startTime = Date.now();
            while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
                if ((Date.now()-startTime) > 3000)
                    break;
            } // until its loaded or we time out after three seconds
            if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
                throw "Unable to open "+descr+" file!";
            else
                return JSON.parse(httpReq.response); 
        } // end if good params
    } // end try    
    
    catch(e) {
        console.log(e);
        return(String.null);
    }
} // end get input spheres

// set up the webGL environment
function setupWebGL() {

    // Get the canvas and context
    canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
    gl = canvas.getContext("webgl"); // get a webgl object from it
    
    try {
      if (gl == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
        gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL

// read triangles in, load them into webgl buffers
function loadTriangles(imageType) {
    var inputTriangles;
    if (imageType == 1) {
      var inputTriangles = getJSONFile(NEW_INPUT_TRIANGLES_URL,"triangles");
    }
    else {
      var inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles");
    }
    if (inputTriangles != String.null) { 
        var whichSetVert; // index of vertex in current triangle set
        var whichSetTri; // index of triangle in current triangle set
        var coordArray = []; // 1D array of vertex coords for WebGL
        var indexArray = []; // 1D array of index coords for WebGL
        var colorArray = []; // 1D array of colors for WebGL
        var normalArray = []; // 1D array of normals for WebGL
        var vtxBufferSize = 0; // the number of vertices in the triangle buffer
        var vtxToAdd = [];
        var indexOffset = vec3.create();
        //var triToAdd = vec3.create();
        triBufferSize = 0;
        var selectedTri = []; // 1D array of true/false for selected triangles
        
        for (var whichSet=0; whichSet<inputTriangles.length; whichSet++) {
            vec3.set(indexOffset,vtxBufferSize,vtxBufferSize,vtxBufferSize);
            selectedTri[whichSet] = false;
            transforms[whichSet] = new Transform();
            var startIndex = indexArray.length;
            var vert = inputTriangles[whichSet].vertices;
            var center = vec3.create();

            // Find center of triangles to scale around for highlight
            for (var v of vert) {
              vec3.add(center, center, v);
            }
            vec3.scale(center, center, 1.0/vert.length);
            transforms[whichSet].center = center;
             
            // set up the vertex coord array
            for (whichSetVert=0; whichSetVert<inputTriangles[whichSet].vertices.length; whichSetVert++){
                vtxToAdd = inputTriangles[whichSet].vertices[whichSetVert];
                coordArray.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]);
                // coordArray = coordArray.concat(inputTriangles[whichSet].vertices[whichSetVert]);
                // console.log(inputTriangles[whichSet].vertices[whichSetVert]);
            }

            // set up the index coord array
            for (whichSetTri=0; whichSetTri<inputTriangles[whichSet].triangles.length; whichSetTri++){
                var triangle = inputTriangles[whichSet].triangles[whichSetTri];
                //vec3.add(triToAdd, indexOffset, inputTriangles[whichSet].triangles[whichSetTri]);
                indexArray.push(triangle[0] + vtxBufferSize, triangle[1] + vtxBufferSize, triangle[2] + vtxBufferSize);
                //indexArray.push(triToAdd[0], triToAdd[1], triToAdd[2]);
                // indexArray = indexArray.concat(inputTriangles[whichSet].triangles[whichSetTri]);
            }

            var count = indexArray.length - startIndex;
            indexInfo[whichSet] = {startIndex: startIndex, indexCount: count};

            materials[whichSet] = {
              ambient: inputTriangles[whichSet].material.ambient,
              diffuse: inputTriangles[whichSet].material.diffuse,
              specular: inputTriangles[whichSet].material.specular,
              reflectivity: inputTriangles[whichSet].material.n
            }

            for (whichSetVert=0; whichSetVert<inputTriangles[whichSet].vertices.length; whichSetVert++) {
              colorArray.push(inputTriangles[whichSet].material.diffuse[0],
                              inputTriangles[whichSet].material.diffuse[1],
                              inputTriangles[whichSet].material.diffuse[2],
              );
            }

            for (whichSetVert=0; whichSetVert<inputTriangles[whichSet].vertices.length; whichSetVert++) {
              var norms = inputTriangles[whichSet].normals[whichSetVert];
              normalArray.push(norms[0],norms[1],norms[2]);
            }
            

            vtxBufferSize += inputTriangles[whichSet].vertices.length;
            triBufferSize += inputTriangles[whichSet].triangles.length;
        } // end for each triangle set
        triBufferSize *= 3;
        // console.log(coordArray.length);
        // send the vertex coords to webGL
        vertexBuffer = gl.createBuffer(); // init empty vertex coord buffer
        gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate that buffer
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(coordArray),gl.STATIC_DRAW); // coords to that buffer

        triangleBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexArray), gl.STATIC_DRAW);

        colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colorArray), gl.STATIC_DRAW);

        normalsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normalArray), gl.STATIC_DRAW);
        
    } // end if triangles found
} // end load triangles

// setup the webGL shaders
function setupShaders() {
    
    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        precision mediump float;
        varying vec3 fragColor;
        varying vec3 fragNormal;
        varying vec3 fragPos;

        const vec3 lightPos = vec3(-0.5, 1.5, -0.5);
        const vec3 lightCol = vec3(1.0, 1.0, 1.0);

        uniform vec3 eye;
        uniform vec3 ambient;
        uniform vec3 diffuse;
        uniform vec3 specular;
        uniform float reflectivity;

        void main(void) {
            vec3 normal = normalize(fragNormal);
            vec3 light = normalize(lightPos - fragPos);
            vec3 view = normalize(eye - fragPos);
            vec3 H = normalize(light + view);

            float df = max( dot( normal, light ), 0.0 );
            float sp = pow( max( dot( normal, H ), 0.0 ), reflectivity );

            vec3 a = ambient * lightCol;
            vec3 d = df * diffuse * lightCol;
            vec3 s = sp * specular * lightCol;
            vec3 mainCol = a + d + s;

            gl_FragColor = vec4(mainCol * fragColor, 1.0);
        }
    `;
    
    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 vertexPosition;
        attribute vec3 vertexColor;
        attribute vec3 vertexNormal;
        uniform mat4 viewMatrix;
        uniform mat4 perspMatrix;
        uniform mat4 TriMatrix;

        varying vec3 fragColor;
        varying vec3 fragNormal;
        varying vec3 fragPos;

        void main(void) {
            vec4 worldPos = TriMatrix * vec4(vertexPosition, 1.0);
            fragPos = worldPos.xyz;
            fragNormal = mat3(TriMatrix) * vertexNormal;
            gl_Position = perspMatrix * viewMatrix * worldPos;
            fragColor = vertexColor;
        }
    `;
    
    try {
        // console.log("fragment shader: "+fShaderCode);
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        // console.log("vertex shader: "+vShaderCode);
        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            var shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                mat4.lookAt(view, Eye, lookAt, viewUp); // Calculate lookat matrix
                mat4.perspective(perspective, ( 2 * Math.PI)/4, canvas.width/canvas.height, 0.1, 10.0); // Calculate perspective matrix

                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                viewMatrixUniform = gl.getUniformLocation(shaderProgram, "viewMatrix");
                gl.uniformMatrix4fv(viewMatrixUniform, false, view);
                perspMatrixUniform = gl.getUniformLocation(shaderProgram, "perspMatrix");
                gl.uniformMatrix4fv(perspMatrixUniform, false, perspective);
                TriMatrixUniform = gl.getUniformLocation(shaderProgram, "TriMatrix");
                
                eyeUniform = gl.getUniformLocation(shaderProgram, "eye");
                gl.uniform3fv(eyeUniform, Eye);
                ambientUniform = gl.getUniformLocation(shaderProgram, "ambient");
                diffuseUniform = gl.getUniformLocation(shaderProgram, "diffuse");
                specularUniform = gl.getUniformLocation(shaderProgram, "specular");
                reflectivityUniform = gl.getUniformLocation(shaderProgram, "reflectivity");

                vertexPositionAttrib = // get pointer to vertex shader input
                    gl.getAttribLocation(shaderProgram, "vertexPosition"); 
                gl.enableVertexAttribArray(vertexPositionAttrib); // input to shader from array
                vertexColorAttrib = 
                    gl.getAttribLocation(shaderProgram, "vertexColor");
                gl.enableVertexAttribArray(vertexColorAttrib);
                vertexNormalAttrib = 
                    gl.getAttribLocation(shaderProgram, "vertexNormal");
                gl.enableVertexAttribArray(vertexNormalAttrib);
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

// render the loaded model
function renderTriangles() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers

    requestAnimationFrame(renderTriangles);

    // vertex buffer: activate and feed into vertex shader
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate
    gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0); // feed

    gl.bindBuffer(gl.ARRAY_BUFFER,colorBuffer);
    gl.vertexAttribPointer(vertexColorAttrib,3,gl.FLOAT,false,0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER,normalsBuffer);
    gl.vertexAttribPointer(vertexNormalAttrib,3,gl.FLOAT,false,0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffer);

    for (var i = 0; i < indexInfo.length; i++) {
      var transMatrix = transforms[i].getTransform();
      gl.uniformMatrix4fv(TriMatrixUniform, false, transMatrix);

      var start = indexInfo[i].startIndex;
      var count = indexInfo[i].indexCount;
      var offset = start * Uint16Array.BYTES_PER_ELEMENT;

      gl.uniform3fv(ambientUniform, materials[i].ambient);
      gl.uniform3fv(diffuseUniform, materials[i].diffuse);
      gl.uniform3fv(specularUniform, materials[i].specular);
      gl.uniform1f(reflectivityUniform, materials[i].reflectivity);
      gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,offset);
    }
    
} // end render triangles


/* MAIN -- HERE is where execution begins after window load */

function main() {
  
  setupWebGL(); // set up the webGL environment
  loadTriangles(0); // load in the triangles from tri file
  setupShaders(); // setup the webGL shaders
  renderTriangles(); // draw the triangles using webGL

  document.addEventListener('keydown', (event) => {
      if (event.code == "KeyA" ) {
        if (event.shiftKey) {
          lookAt[0] += 0.03;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        else {
          Eye[0] -= 0.015;
          lookAt[0] -= 0.015;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        
      }
      else if (event.code == "KeyD" ) {
        if (event.shiftKey) {
          lookAt[0] -= 0.03;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        else {
          Eye[0] += 0.015;
          lookAt[0] += 0.015;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        
      }
      else if (event.code == "KeyS" ) {
        if (event.shiftKey) {
          lookAt[1] += 0.03;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        else {
          Eye[2] -= 0.015;
          lookAt[2] -= 0.015;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        
      }
      else if (event.code == "KeyW" ) {
        if (event.shiftKey) {
          lookAt[1] -= 0.03;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        else {
          Eye[2] += 0.015;
          lookAt[2] += 0.015;
          mat4.lookAt(view, Eye, lookAt, viewUp);
          gl.uniformMatrix4fv(viewMatrixUniform, false, view);
        }
        
      }
      else if (event.code == "KeyQ" ) {
        Eye[1] -= 0.015;
        lookAt[1] -= 0.015;
        mat4.lookAt(view, Eye, lookAt, viewUp);
        gl.uniformMatrix4fv(viewMatrixUniform, false, view);
      }
      else if (event.code == "KeyE" ) {
        Eye[1] += 0.015;
        lookAt[1] += 0.015;
        mat4.lookAt(view, Eye, lookAt, viewUp);
        gl.uniformMatrix4fv(viewMatrixUniform, false, view);
      }
      else if (event.code == "Space") {
        if (selectionON) {
          selectionON = false;
        }
        else {
          selectionON = true;
        }
        changeSelection(0);
      }
      else if (event.code == "KeyK" && selectionON ) {
        if (event.shiftKey) {
          transforms[selectionIndex].rotation[1] -= (3 * Math.PI)/180;
        }
        else {
          transforms[selectionIndex].translation[0] += 0.025;
        }
      }
      else if (event.code == "Semicolon" && selectionON ) {
        if (event.shiftKey) {
          transforms[selectionIndex].rotation[1] += (3 * Math.PI)/180;
        }
        else {
          transforms[selectionIndex].translation[0] -= 0.025;
        }
      }
      else if (event.code == "KeyI" && selectionON ) {
        if (event.shiftKey) {
          transforms[selectionIndex].rotation[2] += (3 * Math.PI)/180;
        }
        else {
          transforms[selectionIndex].translation[1] += 0.025;
        }
      }
      else if (event.code == "KeyP" && selectionON ) {
        if (event.shiftKey) {
          transforms[selectionIndex].rotation[2] -= (3 * Math.PI)/180;
        }
        else {
          transforms[selectionIndex].translation[1] -= 0.025;
        }
      }
      else if (event.code == "KeyO" && selectionON ) {
        if (event.shiftKey) {
          transforms[selectionIndex].rotation[0] += (3 * Math.PI)/180;
        }
        else {
          transforms[selectionIndex].translation[2] += 0.025;
        }
      }
      else if (event.code == "KeyL" && selectionON ) {
        if (event.shiftKey) {
          transforms[selectionIndex].rotation[0] -= (3 * Math.PI)/180;
        }
        else {
          transforms[selectionIndex].translation[2] -= 0.025;
        }
      }
      else if (event.code == "ArrowLeft" && selectionON) {
        changeSelection(-1);
      }
      else if (event.code == "ArrowRight" && selectionON) {
        changeSelection(1);
      }
      else if (event.code == "Digit1" && event.shiftKey ) {
        loadTriangles(1);
        setupShaders();
        renderTriangles(); 
      }
  });
  
} // end main