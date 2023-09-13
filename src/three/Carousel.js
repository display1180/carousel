import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { usePrevious } from 'react-use';
import gsap from 'gsap';
import { lerp, getPiramidalIndex } from '../utils';
import images from '../data/images';

/*------------------------------
Plane Settings
------------------------------*/
const planeSettings = {
	width: 2.5,
	height: 2.5,
	gap: 0.1,
};

/*------------------------------
Carousel
------------------------------*/
const Carousel = () => {
	const [$root, setRoot] = useState();
	const $post = useRef();

	const [activePlane, setActivePlane] = useState(null);
	const prevActivePlane = usePrevious(activePlane);
	const { viewport } = useThree();

	/*--------------------
  Vars
  --------------------*/
	const progress = useRef(0);
	const oldProgress = useRef(0);
	const speed = useRef(0);
	const $items = useMemo(() => {
		if ($root) return $root.children;
	}, [$root]);

	/*--------------------
  Diaplay Items
  --------------------*/
	const displayItems = (item, index, active) => {
		const piramidalIndex = getPiramidalIndex($items, active)[index];
		gsap.to(item.position, {
			x: (index - active) * (planeSettings.width + planeSettings.gap),
			y: $items.length * -0.1 + piramidalIndex * 0.1,
		});
	};

	/*--------------------
  RAF
  --------------------*/
	useFrame(() => {
		progress.current = Math.max(0, Math.min(progress.current, 100));

		const active = Math.floor((progress.current / 100) * ($items.length - 1));
		$items.forEach((item, index) => displayItems(item, index, active));
		speed.current = lerp(speed.current, Math.abs(oldProgress.current - progress.current), 0.1);

		oldProgress.current = lerp(oldProgress.current, progress.current, 0.1);

		if ($post.current) {
			$post.current.thickness = speed.current;
		}
	});

	/*--------------------
  Click
  --------------------*/
	useEffect(() => {
		if (!$items) return;
		if (activePlane !== null && prevActivePlane === null) {
			progress.current = (activePlane / ($items.length - 1)) * 100; // Calculate the progress.current based on activePlane
		}
	}, [activePlane, $items]);

	/*--------------------
  Render Slider
  --------------------*/
	const renderSlider = () => {
		return (
			<group ref={setRoot}>
				{images.map((item, i) => (
					<CarouselItem
						width={planeSettings.width}
						height={planeSettings.height}
						setActivePlane={setActivePlane}
						activePlane={activePlane}
						key={item.image}
						item={item}
						index={i}
					/>
				))}
			</group>
		);
	};

	return <>{renderSlider()}</>;
};

export default Carousel;

export const CarouselItem = ({ index, width, height, setActivePlane, activePlane, item }) => {
	const $root = useRef();
	const [hover, setHover] = useState(false);
	const [isActive, setIsActive] = useState(false);
	const [isCloseActive, setCloseActive] = useState(false);
	const { viewport } = useThree();
	const timeoutID = useRef();

	useEffect(() => {
		if (activePlane === index) {
			setIsActive(activePlane === index);
			setCloseActive(true);
		} else {
			setIsActive(null);
		}
	}, [activePlane]);

	const handleClose = (e) => {
		e.stopPropagation();
		if (!isActive) return;
		setActivePlane(null);
		setHover(false);
		clearTimeout(timeoutID.current);
		timeoutID.current = setTimeout(() => {
			setCloseActive(false);
		}, 1500); // The duration of this timer depends on the duration of the plane's closing animation.
	};

	return (
		<group
			ref={$root}
			onClick={() => {
				setActivePlane(index);
			}}
		>
			<Plane width={width} height={height} texture={item.image} active={isActive} />

			{isCloseActive ? (
				<mesh position={[0, 0, 0.01]} onClick={handleClose}>
					<planeGeometry args={[viewport.width, viewport.height]} />
					<meshBasicMaterial transparent={true} opacity={0} color={'red'} />
				</mesh>
			) : null}
		</group>
	);
};

export const Plane = ({ texture, width, height, active, ...props }) => {
	const $mesh = useRef();
	const { viewport } = useThree();
	const tex = useTexture(texture);

	useEffect(() => {
		if ($mesh.current.material) {
			//  Setting the 'uZoomScale' uniform in the 'Plane' component to resize the texture proportionally to the dimensions of the viewport.
			$mesh.current.material.uniforms.uZoomScale.value.x = viewport.width / width;
			$mesh.current.material.uniforms.uZoomScale.value.y = viewport.height / height;

			gsap.to($mesh.current.material.uniforms.uProgress, {
				value: active ? 1 : 0,
			});

			gsap.to($mesh.current.material.uniforms.uRes.value, {
				x: active ? viewport.width : width,
				y: active ? viewport.height : height,
			});
		}
	}, [viewport, active]);

	const shaderArgs = useMemo(
		() => ({
			uniforms: {
				uProgress: { value: 0 },
				uZoomScale: { value: { x: 1, y: 1 } },
				uTex: { value: tex },
				uRes: { value: { x: 1, y: 1 } },
				uImageRes: {
					value: { x: tex.source.data.width, y: tex.source.data.height },
				},
			},
			vertexShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uProgress;
        uniform vec2 uZoomScale;

        void main() {
          vUv = uv;
          vec3 pos = position;
          float angle = uProgress * 3.14159265 / 2.;
          float wave = cos(angle);
          float c = sin(length(uv - .5) * 15. + uProgress * 12.) * .5 + .5;
          pos.x *= mix(1., uZoomScale.x + wave * c, uProgress);
          pos.y *= mix(1., uZoomScale.y + wave * c, uProgress);

          gl_Position = projectionMatrix * modelViewMatrix * vec4( pos, 1.0 );
        }
      `,
			fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform vec2 uRes;
      uniform vec2 uZoomScale;
      uniform vec2 uImageRes;

      /*------------------------------
      Background Cover UV
      --------------------------------
      u = basic UV
      s = screensize
      i = image size
      ------------------------------*/
      vec2 CoverUV(vec2 u, vec2 s, vec2 i) {
        float rs = s.x / s.y; // Aspect screen size
        float ri = i.x / i.y; // Aspect image size
        vec2 st = rs < ri ? vec2(i.x * s.y / i.y, s.y) : vec2(s.x, i.y * s.x / i.x); // New st
        vec2 o = (rs < ri ? vec2((st.x - s.x) / 2.0, 0.0) : vec2(0.0, (st.y - s.y) / 2.0)) / st; // Offset
        return u * s / st + o;
      }

      varying vec2 vUv;
        void main() {
          vec2 uv = CoverUV(vUv, uRes, uImageRes);
          vec3 tex = texture2D(uTex, uv).rgb;
          gl_FragColor = vec4( tex, 1.0 );
        }
      `,
		}),
		[tex]
	);

	return (
		<>
			<mesh ref={$mesh} {...props}>
				<planeGeometry args={[width, height, 30, 30]} />
				<shaderMaterial args={[shaderArgs]} />
			</mesh>
		</>
	);
};
