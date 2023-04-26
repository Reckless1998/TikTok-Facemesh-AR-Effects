import React, { useEffect, useRef, useState } from 'react'
import './index.css'
import '@mediapipe/face_mesh';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as tf from "@tensorflow/tfjs-core";
import { Scene, AmbientLight, PointLight, PerspectiveCamera, WebGLRenderer, BufferGeometry, Float32BufferAttribute, TextureLoader, MeshBasicMaterial, Color, sRGBEncoding, Mesh } from 'three';
import { TRIANGULATION } from '../../assets/TRIANGULATION'
import { UV_COORDS } from '../../assets/UV_COORDS'
import meshList from '../../assets/mesh.json'


let globalModel, webcamElement, render3D, mesh, geometry, scene

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
        try {
            const video = webcam.current;
            const faces = await globalModel.estimateFaces(video, {
                flipHorizontal: false, //镜像
            });
            
            if (faces.length > 0) {
                const keypoints = faces[0].keypoints;
                render3D({ 
                    scaledMesh:keypoints.reduce((acc, pos) => {
                        acc.push([pos.x,pos.y,pos.z])
                        return acc
                    }, [])
                });
            }else{
                render3D({scaledMesh:[]})
            }
            requestAnimationFrame(recognition)
        } catch (error) {
            console.log(error);
        }
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
    
    // 3D 贴图
    const loadScene = () => {
        // 3D场景
        scene = new Scene();

        // 添加一些光照
        scene.add( new AmbientLight( 0xcccccc, 0.4 ) );
        
        // 透视相机
        const camera = new PerspectiveCamera( 45, webcamElement.videoWidth / webcamElement.videoHeight, 0.1, 2000 );
        camera.add( new PointLight( 0xffffff, 0.8 ) );
        /*camera.position.x = webcamElement.videoWidth / 2;
        camera.position.y = - webcamElement.videoHeight / 2;
        camera.position.z = -( webcamElement.videoHeight / 2 ) / Math.tan( 45 / 2 )*/
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
        const resolveMesh = (faceMesh, vw, vh) => {
            return faceMesh.map(p => [p[0] - vw / 2, vh / 2 - p[1], -p[2]])
        }

        // 渲染
        render3D = function (prediction) {
            if (prediction) {
                updateGeometry(prediction)
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
    
    useEffect(() => {
        setupWebcam()
    }, [])
    
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

            <form>
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
            </form>
            
           
        </div>
    )
}

export default Home