import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import React from "react";
import { disposeMaterial } from "./MeshUtils"; // Assuming this correctly handles material disposal

// We use a CDN for Draco. We could move this locally if we want to use Viser offline.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");

/**
 * Dispose a 3D object and its resources
 */
export function disposeNode(node: any) {
  if (node instanceof THREE.Mesh) {
    if (node.geometry) {
      node.geometry.dispose();
    }
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach((material) => {
          disposeMaterial(material); // Make sure disposeMaterial handles texture disposal etc.
        });
      } else {
        disposeMaterial(node.material);
      }
    }
  }
  // Also dispose children recursively if necessary, though GLTF loader often creates flat structures
  // node.children.forEach(disposeNode); // Uncomment if your GLTFs have deep hierarchies needing disposal
}

/**
 * Custom hook for loading a GLB model intended for inside viewing
 */
export function useGlbLoader(glb_data: Uint8Array) {
  // State for loaded model and meshes
  const [gltf, setGltf] = React.useState<GLTF>();
  const [meshes, setMeshes] = React.useState<THREE.Mesh[]>([]);

  // Animation mixer reference
  const mixerRef = React.useRef<THREE.AnimationMixer | null>(null);

  // Load the GLB model
  React.useEffect(() => {
    if (!glb_data || glb_data.length === 0) {
        // Handle empty data case if necessary
        setGltf(undefined);
        setMeshes([]);
        if (mixerRef.current) mixerRef.current.stopAllAction();
        mixerRef.current = null;
        return;
    }

    let currentGltf: GLTF | undefined = undefined; // Store gltf for cleanup

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.parse(
      new Uint8Array(glb_data).buffer,
      "",
      (loadedGltf) => {
        currentGltf = loadedGltf; // Assign for cleanup reference
        // Setup animations if present
        if (loadedGltf.animations && loadedGltf.animations.length) {
          mixerRef.current = new THREE.AnimationMixer(loadedGltf.scene);
          loadedGltf.animations.forEach((clip) => {
            mixerRef.current!.clipAction(clip).play();
          });
        } else {
          mixerRef.current = null; // Ensure mixer is null if no animations
        }

        // Process all meshes in the scene
        const currentMeshes: THREE.Mesh[] = [];
        loadedGltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.computeVertexNormals(); // Important for lighting
            obj.geometry.computeBoundingSphere(); // Useful for Viser/Three.js internals

            // --- KEY CHANGE START ---
            // Modify material to render the inside faces
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                // Handle multi-material meshes
                obj.material.forEach((mat) => {
                  mat.side = THREE.DoubleSide; // Render both front and back faces
                  mat.needsUpdate = true; // Flag material properties change
                });
              } else {
                // Handle single material meshes
                obj.material.side = THREE.DoubleSide; // Render both front and back faces
                obj.material.needsUpdate = true; // Flag material properties change
              }
            }
            // --- KEY CHANGE END ---

            currentMeshes.push(obj);
          }
        });

        setMeshes(currentMeshes);
        setGltf(loadedGltf);
      },
      (error) => {
        console.error("Error loading GLB:", error); // Use console.error for errors
        setGltf(undefined);
        setMeshes([]);
        if (mixerRef.current) mixerRef.current.stopAllAction();
        mixerRef.current = null;
      },
    );

    // Cleanup function
    return () => {
        // Stop animations
        if (mixerRef.current) {
            mixerRef.current.stopAllAction();
            // You might need to explicitly remove the mixer target if you reuse scenes
            // mixerRef.current = null; // Reset ref if component unmounts fully
        }

        // Dispose of Three.js resources
        if (currentGltf) {
            // Traverse and dispose geometry/materials
            currentGltf.scene.traverse(disposeNode);

            // You might also want to dispose textures explicitly if not handled by disposeMaterial
            // This often requires traversing materials and checking texture properties (map, normalMap, etc.)
        }

        // Reset state on cleanup
        setGltf(undefined);
        setMeshes([]);
    };
  }, [glb_data]); // Dependency array includes glb_data

  // Return the loaded model, meshes, and mixer for animation updates
  return { gltf, meshes, mixerRef };
}