import React, { useEffect, useRef, useState } from 'react'
import './index.css'
import '@mediapipe/face_mesh';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as tf from "@tensorflow/tfjs-core";
import { Scene, AmbientLight, PointLight, PerspectiveCamera, WebGLRenderer, BufferGeometry, Float32BufferAttribute, TextureLoader, MeshBasicMaterial, Color, sRGBEncoding, Mesh, Object3D, Box3, Vector3, Matrix4, MathUtils } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TRIANGULATION } from '../../assets/TRIANGULATION'
import { UV_COORDS } from '../../assets/UV_COORDS'
import meshList from '../../assets/mesh.json'
import paris from '../../assets/img/paris.png'
import { Face } from "kalidokit";


// face effects page
import dog_face from './dog_face.html'
import cloud from './cloud.html'


let globalModel, webcamElement, render3D, mesh, geometry, scene, object, Object3d, loaderIsLoad = false, needAddObject3D = true, camera

const Home = () => {
    
    const webcam = useRef(null)
    const overlay = useRef(null)
    const [activeMesh, setActiveMesh] = useState(0)
    
    const setupWebcam = async () => {
        return new Promise( ( resolve, reject ) => {
            webcamElement = webcam.current
            const navigatorAny = navigator;
            navigator.getUserMedia = navigator.getUserMedia ||
                navigatorAny.webkitGetUserMedia || navigatorAny.mozGetUserMedia ||
                navigatorAny.msGetUserMedia;
            if( navigator.getUserMedia ) {
                navigator.getUserMedia( { video: true }, stream => {
                    webcamElement.srcObject = stream;
                    webcamElement.play()
                    webcamElement.addEventListener( "loadeddata", resolve, false );
                    createModel().then(res => {
                        loadScene()
                        res && recognition()
                    })
                    },
                    error => reject());
            }
            else {
                console.log('摄像头开启失败')
                reject();
            }
        });
    }

    // 创建模型
    const createModel = async () => {
        return new Promise(async resolve => {
            await tf.setBackend('webgl')
            const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
            const detectorConfig = {
                maxFaces: 1, //检测到的最大面部数量
                refineLandmarks: true, //可以完善眼睛和嘴唇周围的地标坐标，并在虹膜周围输出其他地标
                runtime: 'mediapipe',
                solutionPath: 'https://unpkg.com/@mediapipe/face_mesh', //WASM二进制文件和模型文件所在的路径
            };
            globalModel = await faceLandmarksDetection.createDetector(model, detectorConfig);
            resolve(globalModel);
        })
    }
    // 识别
    const recognition = async () => {
        // try {
            const video = webcam.current;
            const faces = await globalModel.estimateFaces(video, {
                flipHorizontal: false, //镜像
            });
            
            if (faces.length > 0) {
                const keypoints = faces[0].keypoints;
                const scaledMesh = keypoints.reduce((acc, pos) => {
                    acc.push([pos.x,pos.y,pos.z])
                    return acc
                }, [])
                
                const faceMesh = resolveMesh(scaledMesh)

                const faceRig = Face.solve(keypoints, {
                    runtime: "mediapipe",
                    video: webcam.current,
                    imageSize: { height: overlay.current.canvasHeight, width: overlay.current.canvasWidth },
                    smoothBlink: false,
                    blinkSettings: [.25, .75]
                });
                
                render3D({
                    scaledMesh,
                    midwayBetweenEyes: [168].map(e => faceMesh[e]),
                    faceMesh,
                    faceRig
                });
            }else{
                render3D({scaledMesh:[], midwayBetweenEyes: [], faceMesh: [], })
            }
            requestAnimationFrame(recognition)
        // } catch (error) {
        //     console.log(error);
        // }
    }
    
    const addMesh = (meshIndex = 0) => {
        // 创建 geometry，将 468 个人脸特征点按照一定的顺序(TRIANGULATION)组成三角网格，并加载 UV_COORDS
        geometry = new BufferGeometry()
        geometry.setIndex(TRIANGULATION)
        geometry.setAttribute('uv', new Float32BufferAttribute(UV_COORDS.map((item, index) => index % 2 ? item : 1 - item), 2))
        geometry.computeVertexNormals()

        // 创建 material
        const textureLoader = new TextureLoader();

        const meshImg = meshList[meshIndex].src;// 材质图片地址 特效贴图地址

        textureLoader.load(meshImg,texture => {
            texture.encoding = sRGBEncoding
            texture.anisotropy = 16
            const material = new MeshBasicMaterial({
                map: texture,
                transparent: true,
                color: new Color(0xffffff),
                reflectivity: 0.5
            });
            mesh = new Mesh(geometry, material)
            scene.add(mesh)
        })
    }

    const resolveMesh = (faceMesh, vw = webcam.current.videoWidth, vh = webcam.current.videoHeight) => {
        return faceMesh.map(p => [p[0] - vw / 2, vh / 2 - p[1], -p[2]])
    }
    
    // 3D 贴图
    const loadScene = () => {
        // 3D场景
        scene = new Scene();

        // 添加一些光照
        scene.add( new AmbientLight( 0xcccccc, 1 ) );
        
        // 透视相机
        camera = new PerspectiveCamera( 45, webcamElement.videoWidth / webcamElement.videoHeight, 0.1, 2000 );
        camera.add( new PointLight( 0xffffff, 1 ) );
        /*camera.position.x = webcamElement.videoWidth / 2;
        camera.position.y = - webcamElement.videoHeight / 2;
        camera.position.z = -( webcamElement.videoHeight / 2 ) / Math.tan( 45 / 2 )*/
        // camera.position.set(0, 0, webcamElement.videoHeight * 1.18)
        camera.position.set(0, 0, webcamElement.videoHeight * 1.18)
        // const faceCenter = getFaceCenter()
        // camera.lookAt(scene.position)
        scene.add( camera );

        // 渲染器
        const renderer = new WebGLRenderer({
            canvas: overlay.current,
            alpha: true
        });

        addMesh()
        
        // 根据 face mesh 实时更新 geometry
        const updateGeometry = (prediction) => {
            const w = webcam.current.videoWidth
            const h = webcam.current.videoHeight
            const faceMesh = resolveMesh(prediction.scaledMesh, w, h)
            const positionBuffer = faceMesh.reduce((acc, pos) => acc.concat(pos), [])
            geometry.setAttribute('position', new Float32BufferAttribute(positionBuffer, 3))
            geometry.attributes.position.needsUpdate = true
        }
        

        // 渲染
        render3D = (prediction) => {
            if (prediction) {
                // updateGeometry(prediction)
                // console.log('prediction', prediction)
                // Object3d && Object3d.remove(object)
                // scene&& scene.remove(Object3d)
                render3DModel('https://dcdn.it120.cc/2022/12/07/55607c9c-1aaa-494a-b332-6a5360933c4a.glb', prediction)
            }
            renderer.render(scene, camera)
        }
    }
    
    const changeMesh = (meshIndex) => {
        try {
            mesh && scene.remove(mesh)
            geometry && scene.remove(geometry);
            
            addMesh(meshIndex)

        } catch (e) {
            console.log('图片设置失败', e)
        }
        setActiveMesh(meshIndex)
    }
    
    // 亮度
    const [brightness, setBrightness] = useState(1)
    const changeBrightness = (e) => {
        setBrightness(e.target.value / 50)
    }
    
    // 模糊度
    const [blur ,setBlur] = useState(0)
    const changeBlur = (e) => {
        setBlur(e.target.value / 50)
    }
    

    /*// 调用模型进行去除背景
    async function main() {
        const img = new Image()
        img.src = paris
        const cvs = overlay.current
        const video = webcam.current
        // const video = document.querySelector('video');
        // const canvas = document.getElementById('canvas');

        const webcam = await tf.data.webcam(video);
        const model = await tf.loadGraphModel('../../model/model.json');

        const ctxBg = canvasBg.current.getContext('2d')
        ctxBg.drawImage(img,0,0,cvs.width,cvs.height)

        let [r1i, r2i, r3i, r4i] = [tf.tensor(0.), tf.tensor(0.), tf.tensor(0.), tf.tensor(0.)];

        const downsample_ratio = tf.tensor(0.5);
        while (true) {
            await tf.nextFrame();
            const img = await webcam.capture();
            const src = tf.tidy(() => img.expandDims(0).div(255));
            const [fgr, pha, r1o, r2o, r3o, r4o] = await model.executeAsync(
                { src, r1i, r2i, r3i, r4i, downsample_ratio },
                ['fgr', 'pha', 'r1o', 'r2o', 'r3o', 'r4o']
            );
            drawMatte(fgr.clone(), pha.clone(), cvs);
            tf.dispose([img, src, fgr, pha, r1i, r2i, r3i, r4i]);
            [r1i, r2i, r3i, r4i] = [r1o, r2o, r3o, r4o];
        }
    }

    async function drawMatte(fgr, pha, canvas) {
        const rgba = tf.tidy(() => {
            const rgb = (fgr !== null) ?
                fgr.squeeze(0).mul(255).cast('int32') :
                tf.fill([pha.shape[1], pha.shape[2], 3], 255, 'int32');
            const a = (pha !== null) ?
                pha.squeeze(0).mul(255).cast('int32') :
                tf.fill([fgr.shape[1], fgr.shape[2], 1], 255, 'int32');
            return tf.concat([rgb, a], -1);
        });

        fgr && fgr.dispose();
        pha && pha.dispose();
        const [height, width] = rgba.shape.slice(0, 2);
        const pixelData = new Uint8ClampedArray(await rgba.data());
        const imageData = new ImageData(pixelData, width, height);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")
        context.putImageData(imageData, 0, 0);
        context.getImageData(0, 0, width, height)
        context.globalCompositeOperation = "destination-over"
        context.drawImage(canvasBg.current, 0, 0)
        rgba.dispose();
    }*/
    
    useEffect(() => {
        setupWebcam()
        // main()
    }, [])
    
    const render3DModel = (modelUrl, prediction) => {
        if (!loaderIsLoad) {
            loaderIsLoad = true
            const loader = new GLTFLoader();
            Object3d = new Object3D();
            // Object3d.position.set(0, 0, 0)
            loader.load(modelUrl, (gltf) => {
                object = gltf.scene
                const box = new Box3().setFromObject(object)
                const size = box.getSize(new Vector3()).length()
                const center = box.getCenter(new Vector3())
                object.position.x += (object.position.x - center.x);
                object.position.y += (object.position.y - center.y + 1);
                object.position.z += (object.position.z - center.z - 15);
                Object3d.add(object)
                needAddObject3D && scene.add(Object3d)
                needAddObject3D = false
            })
        }

        const getScale = (e, t = 0, s = 1) => {
            const n = new Vector3(...e[t]), i = new Vector3(...e[s]);
            return n.distanceTo(i)
        }

        const getRotation = (e, t = 0, s = 1, n = 2) => {
            const i = new Vector3(...e[t]), r = new Vector3(...e[s]), o = new Vector3(...e[n]),
                a = new Matrix4, c = r.clone().sub(o).normalize(),
                l = r.clone().add(o).multiplyScalar(.5).sub(i).multiplyScalar(-1).normalize(),
                h = (new Vector3).crossVectors(c, l).normalize();
            return a.makeBasis(c, l, h).invert()
        }

        const findMorphTarget = (e) => {
            const s = {}, n = e => {
                if ("Mesh" === e.type && e.morphTargetInfluences) {
                    const t = e;
                    Object.keys(t.morphTargetDictionary).forEach(e => {
                        s[e] = (s => {
                            t.morphTargetInfluences[t.morphTargetDictionary[e]] = s
                        })
                    })
                }
                e.children.forEach(n)
            };
            return n(e), s
        }

        const morphTarget = findMorphTarget(scene)
        
        // 计算 Matrix
        if (!prediction.midwayBetweenEyes || !prediction.scaledMesh.length) {
            scene.remove(Object3d)
            return
        } else {
            scene.add(Object3d)
        }
        const position = prediction.midwayBetweenEyes[0]
        const scale = getScale(prediction.scaledMesh, 234, 454)
        const rotation = getRotation(prediction.scaledMesh, 10, 50, 280)
        if (object) {
            object.position.set(...position)
            object.scale.setScalar(scale / 20)
            object.scale.x *= -1
            object.rotation.setFromRotationMatrix(rotation)
            object.rotation.y = -object.rotation.y
            object.rotateZ(Math.PI)
            object.rotateX(-Math.PI * .05)
        }
            
        if (morphTarget) {
            // flipped
            morphTarget['leftEye'] && morphTarget['leftEye'](1 - prediction.faceRig.eye.r)
            morphTarget['rightEye'] && morphTarget['rightEye'](1 - prediction.faceRig.eye.l)
            morphTarget['mouth'] && morphTarget['mouth'](prediction.faceRig.mouth.shape.A)
        }
        
        
    }
    
    return(
        <div>
            <div className='meshListBox'>
                { meshList.map((item, index) =>
                    <div className="meshList" key={item.src}>
                        <img src={item.src}
                             alt=""
                             onClick={() => activeMesh !== index && changeMesh(index)}
                             className={activeMesh === index ? 'activeMesh' : ''}
                        />
                        <span>{ item.name }</span>
                    </div>)
                }
            </div>
            
            <div className="meshBox">
                <video ref={ webcam } 
                       width={window.screen.width} 
                       height={window.screen.height}
                       style={{filter: `brightness(${brightness}) blur(${blur}px)`}}
                />
                <canvas ref={ overlay } 
                        width={window.screen.width} 
                        height={window.screen.height}
                />
               
            </div>

            {/*<form>
                <label htmlFor="brightness">亮度</label>
                <input type="range" 
                       id="brightness" 
                       onInput={(e) => changeBrightness(e)}
                />
                <br/>
                <label htmlFor="blur">模糊度</label>
                <input type="range" 
                       id="blur"
                       onInput={(e) => changeBlur(e)}
                       defaultValue={0}
                />
            </form>*/}


            <iframe
                srcDoc={cloud}
                style={{ width: '100%', border: 0, margin: 0 }}
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
           
        </div>
    )
}

export default Home