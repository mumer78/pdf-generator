import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

// Fixed output frame aspect ratio (width / height) for non-main pages.
export const FRAME_ASPECT = 16 / 10;
// Rendered at 2x resolution so photos stay sharp in the final PDF.
export const FRAME_WIDTH = 1200;
export const FRAME_HEIGHT = Math.round(FRAME_WIDTH / FRAME_ASPECT);
// Corner radius applied to the exported PNG.
export const CORNER_RADIUS = 36;

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function ImageEditorModal({
  sourceUrl,       // object URL or server URL of the ORIGINAL (uncropped) image
  initialCrop,     // {x,y,width,height} in % of original image, or null
  initialShapes,   // array of {x,y,rx,ry,thickness} in % of the cropped frame, or null
  freeAspect,      // if true, crop is NOT locked to FRAME_ASPECT (main photo pages)
  onClose,
  onSave,          // ({ blob, cropData, shapes, newOriginalFile }) => void
}) {
  // ── Source image ───────────────────────────────────────────────────────
  const [currentSourceUrl, setCurrentSourceUrl] = useState(sourceUrl);
  const [srcImg, setSrcImg] = useState(null);
  const [changedFile, setChangedFile] = useState(null); // file picked via "Change Image"
  const changeImgInputRef = useRef(null);
  const imgRef = useRef(null); // <img> element inside ReactCrop

  // ── Crop ───────────────────────────────────────────────────────────────
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  const [completedCrop, setCompletedCrop] = useState(null);
  // currentCropData: last applied crop kept as %, used to re-enter crop mode
  const [currentCropData, setCurrentCropData] = useState(initialCrop || null);

  // ── Canvas / annotation ────────────────────────────────────────────────
  const canvasRef = useRef(null);
  const baseImgRef = useRef(null); // cached decoded base image for synchronous redraws
  const [workingCanvasUrl, setWorkingCanvasUrl] = useState(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: FRAME_WIDTH, height: FRAME_HEIGHT });
  const [shapes, setShapes] = useState(initialShapes || []);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [tool, setTool] = useState("circle");
  const [thickness, setThickness] = useState(3);
  const [selectedShapeIndex, setSelectedShapeIndex] = useState(null);
  const [dragInfo, setDragInfo] = useState(null); // { type, initialShape, startX, startY }
  const [zoom, setZoom] = useState(1);
  const [panPos, setPanPos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const workspaceRef = useRef(null);
  const drawingRef = useRef(null);

  // ── Synchronous draw: base image + shapes (no async, no flicker) ──────
  const drawCanvas = useCallback((baseImg, shapesToDraw, dims) => {
    if (!canvasRef.current || !baseImg) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = dims;
    // Only resize canvas when dimensions actually change (resizing clears the canvas)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(baseImg, 0, 0, w, h);
    
    shapesToDraw.forEach((s, idx) => {
      ctx.save();
      const cx = (s.x / 100) * w;
      const cy = (s.y / 100) * h;
      const rx = (s.rx / 100) * w;
      const ry = (s.ry / 100) * h;
      const angle = s.angle || 0;

      ctx.translate(cx, cy);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = "#e63946";
      ctx.lineWidth = s.thickness;
      ctx.stroke();

      // Bounding box frame & resize/rotation handles
      if (idx === selectedShapeIndex) {
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(-rx, -ry, 2 * rx, 2 * ry);
        ctx.setLineDash([]);

        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 1.5;
        const hs = 8; // handle size

        const drawHandle = (hx, hy) => {
          ctx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
          ctx.strokeRect(hx - hs/2, hy - hs/2, hs, hs);
        };

        // Resize handles
        drawHandle(-rx, -ry); // top-left
        drawHandle(rx, -ry);  // top-right
        drawHandle(-rx, ry);  // bottom-left
        drawHandle(rx, ry);   // bottom-right
        drawHandle(0, -ry);   // top-center
        drawHandle(rx, 0);    // right-center
        drawHandle(0, ry);    // bottom-center
        drawHandle(-rx, 0);   // left-center

        // Rotation handle line & circular arrow icon
        const rotY = -ry - 26;
        ctx.beginPath();
        ctx.moveTo(0, -ry);
        ctx.lineTo(0, rotY);
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw handle background circle (enlarged)
        ctx.beginPath();
        ctx.arc(0, rotY, 13, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw circular rotate arrow icon inside handle (enlarged)
        ctx.beginPath();
        ctx.arc(0, rotY, 7.5, -Math.PI * 0.7, Math.PI * 0.75, false);
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Arrowhead (enlarged)
        const arrowX = 0 + 7.5 * Math.cos(Math.PI * 0.75);
        const arrowY = rotY + 7.5 * Math.sin(Math.PI * 0.75);
        ctx.beginPath();
        ctx.moveTo(arrowX - 3.5, arrowY - 3.5);
        ctx.lineTo(arrowX, arrowY);
        ctx.lineTo(arrowX + 3.5, arrowY - 1.5);
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    });
  }, [selectedShapeIndex]); // stable ref — all state is passed as params

  // ── Load source image ─────────────────────────────────────────────────
  useEffect(() => {
    loadImage(currentSourceUrl).then(setSrcImg).catch(() => {});
  }, [currentSourceUrl]);

  // ── Render initial working canvas once srcImg loads ───────────────────
  useEffect(() => {
    if (!srcImg || workingCanvasUrl) return; // guard: don't overwrite existing canvas
    applyRenderCrop(srcImg, currentCropData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcImg]);

  // ── Cache base image for synchronous redraws ──────────────────────────
  useEffect(() => {
    if (!workingCanvasUrl) return;
    loadImage(workingCanvasUrl).then((img) => {
      baseImgRef.current = img;
      drawCanvas(img, shapes, canvasDimensions);
    }).catch(() => {});
  }, [workingCanvasUrl, drawCanvas, shapes, canvasDimensions]);

  // ── Redraw canvas whenever shapes or selection changes ────────────────
  useEffect(() => {
    if (baseImgRef.current) {
      drawCanvas(baseImgRef.current, shapes, canvasDimensions);
    }
  }, [shapes, canvasDimensions, drawCanvas, selectedShapeIndex]);

  // ── Helper: render a crop region (or full image) to working canvas ─────
  // Returns the data URL and dimensions so caller can cache base img.
  function applyRenderCrop(img, cropData) {
    let sx, sy, sw, sh;
    if (cropData) {
      sx = (cropData.x / 100) * img.naturalWidth;
      sy = (cropData.y / 100) * img.naturalHeight;
      sw = (cropData.width / 100) * img.naturalWidth;
      sh = (cropData.height / 100) * img.naturalHeight;
    } else {
      sx = 0; sy = 0;
      sw = img.naturalWidth; sh = img.naturalHeight;
    }
    const aspect = sw / sh;
    const w = FRAME_WIDTH;
    const h = freeAspect ? Math.round(FRAME_WIDTH / aspect) : FRAME_HEIGHT;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const url = canvas.toDataURL("image/png");
    const dims = { width: w, height: h };
    setWorkingCanvasUrl(url);
    setCanvasDimensions(dims);
    return { url, dims };
  }

  // ── Apply crop (from ReactCrop completedCrop) ─────────────────────────
  const applyCrop = () => {
    if (!imgRef.current || !completedCrop) return;
    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const sx = completedCrop.x * scaleX;
    const sy = completedCrop.y * scaleY;
    const sw = completedCrop.width * scaleX;
    const sh = completedCrop.height * scaleY;
    const aspect = sw / sh;
    const w = FRAME_WIDTH;
    const h = freeAspect ? Math.round(FRAME_WIDTH / aspect) : FRAME_HEIGHT;

    // Persist crop as % for future re-entry into crop mode
    const newCropData = {
      x:      (completedCrop.x      / (image.width  || 1)) * 100,
      y:      (completedCrop.y      / (image.height || 1)) * 100,
      width:  (completedCrop.width  / (image.width  || 1)) * 100,
      height: (completedCrop.height / (image.height || 1)) * 100,
    };

    // Transform shape coordinates so circles stay locked to the same image area
    const oldCrop = currentCropData || { x: 0, y: 0, width: 100, height: 100 };
    const transformedShapes = shapes.map((s) => {
      const orig_x = oldCrop.x + (s.x / 100) * oldCrop.width;
      const orig_y = oldCrop.y + (s.y / 100) * oldCrop.height;
      const orig_rx = (s.rx / 100) * oldCrop.width;
      const orig_ry = (s.ry / 100) * oldCrop.height;

      const new_x = ((orig_x - newCropData.x) / newCropData.width) * 100;
      const new_y = ((orig_y - newCropData.y) / newCropData.height) * 100;
      const new_rx = (orig_rx / newCropData.width) * 100;
      const new_ry = (orig_ry / newCropData.height) * 100;

      return {
        ...s,
        x: new_x,
        y: new_y,
        rx: new_rx,
        ry: new_ry,
      };
    });

    setCurrentCropData(newCropData);

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
    const url = canvas.toDataURL("image/png");
    const newDims = { width: w, height: h };

    // Update shapes and clear undo/redo stack
    setShapes(transformedShapes);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedShapeIndex(null);
    setWorkingCanvasUrl(url);
    setCanvasDimensions(newDims);
    setCropMode(false);

    // Cache the new base image immediately so redraws are synchronous
    loadImage(url).then((img) => {
      baseImgRef.current = img;
      drawCanvas(img, transformedShapes, newDims);
    });
  };

  // ── Enter crop mode: pre-populate crop box from last applied crop ──────
  const enterCropMode = () => {
    const saved = currentCropData;
    const initialBox = saved
      ? { unit: "%", ...saved }
      : { unit: "%", x: 5, y: 5, width: 90, height: 90 };
    setCrop(initialBox);
    // Pre-enable Apply Crop so user can confirm without touching the box
    setCompletedCrop(initialBox);
    setCropMode(true);
  };

  // ── Change Image ───────────────────────────────────────────────────────
  const handleChangeImageFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Reset all state before loading new image
    setSrcImg(null);
    setWorkingCanvasUrl(null);
    setCurrentCropData(null);
    baseImgRef.current = null;
    setShapes([]); setUndoStack([]); setRedoStack([]);
    setSelectedShapeIndex(null);
    setCropMode(false);
    setChangedFile(file);
    setCurrentSourceUrl(url);
    e.target.value = ""; // allow re-picking the same file
  };

  // ── Touch / Mouse helpers ─────────────────────────────────────────────────
  const pinchRef = useRef(null); // { dist, midX, midY, startPanX, startPanY, startZoom }

  /** Normalise a mouse OR touch event to {clientX, clientY} */
  const normEvent = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return e;
  };

  const getPos = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const ne = normEvent(e);
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((ne.clientX - rect.left) / rect.width) * 100,
      y: ((ne.clientY - rect.top) / rect.height) * 100,
    };
  };

  const getPixelPos = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const ne = normEvent(e);
    const rect = canvasRef.current.getBoundingClientRect();
    const { width: w, height: h } = canvasDimensions;
    return {
      x: ((ne.clientX - rect.left) / rect.width) * w,
      y: ((ne.clientY - rect.top) / rect.height) * h,
    };
  };

  /** Touch → synthetic mouse for single-finger gestures */
  const mkMouse = (touch) => ({ clientX: touch.clientX, clientY: touch.clientY });

  const handleTouchStart = (e) => {
    if (cropMode) return;
    if (e.touches.length === 2) {
      // Pinch-to-zoom start
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchRef.current = {
        dist,
        startZoom: zoom,
        startPanX: panPos.x,
        startPanY: panPos.y,
      };
      return;
    }
    pinchRef.current = null;
    handleMouseDown({ ...e, ...mkMouse(e.touches[0]) });
  };

  const handleTouchMove = (e) => {
    if (cropMode) return;
    e.preventDefault(); // stop page scroll while editing
    if (e.touches.length === 2 && pinchRef.current) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scale = dist / pinchRef.current.dist;
      const newZoom = Math.min(4, Math.max(1, Math.round(pinchRef.current.startZoom * scale * 100) / 100));
      setZoom(newZoom);
      if (newZoom === 1) setPanPos({ x: 0, y: 0 });
      return;
    }
    if (e.touches.length === 1) {
      handleMouseMove({ ...e, ...mkMouse(e.touches[0]) });
    }
  };

  const handleTouchEnd = (e) => {
    if (cropMode) return;
    pinchRef.current = null;
    const touch = e.changedTouches[0];
    handleMouseUp({ ...e, ...mkMouse(touch) });
  };

  const getHandleHit = (mx, my, shape, w, h) => {
    const cx = (shape.x / 100) * w;
    const cy = (shape.y / 100) * h;
    const rx = (shape.rx / 100) * w;
    const ry = (shape.ry / 100) * h;
    const angle = shape.angle || 0;

    const dx = mx - cx;
    const dy = my - cy;

    // Rotate cursor position into local coordinate space of shape
    const local_mx = dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const local_my = dx * Math.sin(-angle) + dy * Math.cos(-angle);

    const hitTest = (hx, hy, r = 8) => Math.hypot(local_mx - hx, local_my - hy) < r;

    if (hitTest(-rx, -ry)) return "resize-tl";
    if (hitTest(rx, -ry)) return "resize-tr";
    if (hitTest(-rx, ry)) return "resize-bl";
    if (hitTest(rx, ry)) return "resize-br";
    if (hitTest(0, -ry)) return "resize-tc";
    if (hitTest(rx, 0)) return "resize-rc";
    if (hitTest(0, ry)) return "resize-bc";
    if (hitTest(-rx, 0)) return "resize-lc";
    if (hitTest(0, -ry - 26, 15)) return "rotate";

    if (Math.abs(local_mx) <= rx && Math.abs(local_my) <= ry) {
      return "move";
    }
    return null;
  };

  const getShapeIndexAt = (mx, my, w, h) => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      const cx = (s.x / 100) * w;
      const cy = (s.y / 100) * h;
      const rx = (s.rx / 100) * w;
      const ry = (s.ry / 100) * h;
      const angle = s.angle || 0;

      const dx = mx - cx;
      const dy = my - cy;
      const local_mx = dx * Math.cos(-angle) - dy * Math.sin(-angle);
      const local_my = dx * Math.sin(-angle) + dy * Math.cos(-angle);

      if ((local_mx * local_mx) / (rx * rx) + (local_my * local_my) / (ry * ry) <= 1.2) {
        return i;
      }
    }
    return -1;
  };

  const handleMouseDown = (e) => {
    if (cropMode) return;
    const { width: w, height: h } = canvasDimensions;
    const pixPos = getPixelPos(e);
    const pos = getPos(e);

    // If erase tool is selected, prioritize deleting any clicked shape
    if (tool === "erase") {
      eraseNear(pos);
      return;
    }

    // Clicked inside selected shape handles?
    if (selectedShapeIndex !== null) {
      const activeShape = shapes[selectedShapeIndex];
      const hit = getHandleHit(pixPos.x, pixPos.y, activeShape, w, h);
      if (hit) {
        setDragInfo({
          type: hit,
          initialShape: { ...activeShape },
          startX: pixPos.x,
          startY: pixPos.y,
        });
        return;
      }
    }

    // Clicked other shape?
    const clickedIdx = getShapeIndexAt(pixPos.x, pixPos.y, w, h);
    if (clickedIdx !== -1) {
      setSelectedShapeIndex(clickedIdx);
      setDragInfo({
        type: "move",
        initialShape: { ...shapes[clickedIdx] },
        startX: pixPos.x,
        startY: pixPos.y,
      });
      return;
    }

    // Clicked empty workspace
    setSelectedShapeIndex(null);

    // Circle creation ONLY if circle tool is explicitly selected
    if (tool === "circle") {
      drawingRef.current = { startX: pos.x, startY: pos.y };
      return;
    }

    // If zoomed in or select mode active, pan photo
    if (zoom > 1 || tool === "select") {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panPos.x, y: e.clientY - panPos.y };
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    }
  };

  const updateCursor = (e) => {
    if (!canvasRef.current || cropMode) return;
    const { width: w, height: h } = canvasDimensions;
    const pixPos = getPixelPos(e);
    
    if (selectedShapeIndex !== null) {
      const activeShape = shapes[selectedShapeIndex];
      const hit = getHandleHit(pixPos.x, pixPos.y, activeShape, w, h);
      if (hit === "rotate") {
        canvasRef.current.style.cursor = "grab";
        return;
      }
      if (hit === "resize-tl" || hit === "resize-br") {
        canvasRef.current.style.cursor = "nwse-resize";
        return;
      }
      if (hit === "resize-tr" || hit === "resize-bl") {
        canvasRef.current.style.cursor = "nesw-resize";
        return;
      }
      if (hit === "resize-tc" || hit === "resize-bc") {
        canvasRef.current.style.cursor = "ns-resize";
        return;
      }
      if (hit === "resize-lc" || hit === "resize-rc") {
        canvasRef.current.style.cursor = "ew-resize";
        return;
      }
      if (hit === "move") {
        canvasRef.current.style.cursor = "move";
        return;
      }
    }

    const clickedIdx = getShapeIndexAt(pixPos.x, pixPos.y, w, h);
    if (clickedIdx !== -1) {
      canvasRef.current.style.cursor = "pointer";
      return;
    }

    if (tool === "erase") {
      canvasRef.current.style.cursor = "pointer";
      return;
    }

    if (tool === "circle") {
      canvasRef.current.style.cursor = "crosshair";
      return;
    }

    canvasRef.current.style.cursor = zoom > 1 || tool === "select" ? "grab" : "default";
  };

  // ── Ctrl + Scroll wheel zoom listener on workspace ──────────────────────
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        setZoom((prevZoom) => {
          const newZoom = Math.min(4, Math.max(1, Math.round((prevZoom + delta) * 100) / 100));
          if (newZoom === 1) setPanPos({ x: 0, y: 0 });
          return newZoom;
        });
      }
    };

    ws.addEventListener("wheel", handleWheel, { passive: false });
    return () => ws.removeEventListener("wheel", handleWheel);
  }, []);

  const handleMouseMove = (e) => {
    if (cropMode) return;

    if (isPanning) {
      setPanPos({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
      return;
    }

    updateCursor(e);
    const { width: w, height: h } = canvasDimensions;
    const pixPos = getPixelPos(e);

    if (dragInfo) {
      const { type, initialShape, startX, startY } = dragInfo;
      if (type === "rotate") {
        canvasRef.current.style.cursor = "grabbing";
      }
      const dx = pixPos.x - startX;
      const dy = pixPos.y - startY;

      const cosA = Math.cos(-initialShape.angle);
      const sinA = Math.sin(-initialShape.angle);
      const local_dx = dx * cosA - dy * sinA;
      const local_dy = dx * sinA + dy * cosA;

      const updated = { ...initialShape };

      if (type === "move") {
        updated.x = initialShape.x + (dx / w) * 100;
        updated.y = initialShape.y + (dy / h) * 100;
      } else if (type === "rotate") {
        const cx = (initialShape.x / 100) * w;
        const cy = (initialShape.y / 100) * h;
        updated.angle = Math.atan2(pixPos.y - cy, pixPos.x - cx) + Math.PI / 2;
      } else {
        const cosAngle = Math.cos(initialShape.angle);
        const sinAngle = Math.sin(initialShape.angle);

        const resizeHorizontal = (dir) => {
          const stretch = dir * local_dx;
          const new_rx = Math.max(2, initialShape.rx + (stretch / w) * 100);
          const actual_rx_diff_px = (new_rx - initialShape.rx) * (w / 100);

          const local_shift_x = dir * (actual_rx_diff_px / 2);
          const screen_shift_x = local_shift_x * cosAngle;
          const screen_shift_y = local_shift_x * sinAngle;

          updated.rx = new_rx;
          updated.x = initialShape.x + (screen_shift_x / w) * 100;
          updated.y = initialShape.y + (screen_shift_y / h) * 100;
        };

        const resizeVertical = (dir) => {
          const stretch = dir * local_dy;
          const new_ry = Math.max(2, initialShape.ry + (stretch / h) * 100);
          const actual_ry_diff_px = (new_ry - initialShape.ry) * (h / 100);

          const local_shift_y = dir * (actual_ry_diff_px / 2);
          const screen_shift_x = -local_shift_y * sinAngle;
          const screen_shift_y = local_shift_y * cosAngle;

          updated.ry = new_ry;
          updated.x = initialShape.x + (screen_shift_x / w) * 100;
          updated.y = initialShape.y + (screen_shift_y / h) * 100;
        };

        if (type === "resize-rc") resizeHorizontal(1);
        if (type === "resize-lc") resizeHorizontal(-1);
        if (type === "resize-bc") resizeVertical(1);
        if (type === "resize-tc") resizeVertical(-1);

        if (type === "resize-br") {
          resizeHorizontal(1);
          const temp_cx = updated.x; const temp_cy = updated.y;
          resizeVertical(1);
          updated.x = (temp_cx + updated.x) / 2; updated.y = (temp_cy + updated.y) / 2;
        }
        if (type === "resize-tl") {
          resizeHorizontal(-1);
          const temp_cx = updated.x; const temp_cy = updated.y;
          resizeVertical(-1);
          updated.x = (temp_cx + updated.x) / 2; updated.y = (temp_cy + updated.y) / 2;
        }
        if (type === "resize-tr") {
          resizeHorizontal(1);
          const temp_cx = updated.x; const temp_cy = updated.y;
          resizeVertical(-1);
          updated.x = (temp_cx + updated.x) / 2; updated.y = (temp_cy + updated.y) / 2;
        }
        if (type === "resize-bl") {
          resizeHorizontal(-1);
          const temp_cx = updated.x; const temp_cy = updated.y;
          resizeVertical(1);
          updated.x = (temp_cx + updated.x) / 2; updated.y = (temp_cy + updated.y) / 2;
        }
      }

      setShapes((s) => s.map((shape, i) => (i === selectedShapeIndex ? updated : shape)));
      return;
    }

    if (tool !== "circle" || !drawingRef.current || !baseImgRef.current) return;
    const pos = getPos(e);
    const { startX, startY } = drawingRef.current;
    const rx = Math.abs(pos.x - startX) / 2;
    const ry = Math.abs(pos.y - startY) / 2;
    const cx = (pos.x + startX) / 2;
    const cy = (pos.y + startY) / 2;

    drawCanvas(baseImgRef.current, shapes, canvasDimensions);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.ellipse((cx / 100) * w, (cy / 100) * h, (rx / 100) * w, (ry / 100) * h, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = "#e63946";
    ctx.lineWidth = thickness;
    ctx.stroke();
  };

  const handleMouseUp = (e) => {
    if (cropMode) return;

    if (isPanning) {
      setIsPanning(false);
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      return;
    }

    if (dragInfo) {
      pushUndo();
      setDragInfo(null);
      return;
    }

    if (tool !== "circle" || !drawingRef.current) return;
    const pos = getPos(e);
    const { startX, startY } = drawingRef.current;
    drawingRef.current = null;
    const rx = Math.abs(pos.x - startX) / 2;
    const ry = Math.abs(pos.y - startY) / 2;
    if (rx < 0.5 || ry < 0.5) return;
    const cx = (pos.x + startX) / 2;
    const cy = (pos.y + startY) / 2;

    pushUndo();
    const newShape = { x: cx, y: cy, rx, ry, thickness, angle: 0 };
    setShapes((s) => {
      const nextShapes = [...s, newShape];
      setSelectedShapeIndex(nextShapes.length - 1);
      return nextShapes;
    });
  };

  const eraseNear = (pos) => {
    if (shapes.length === 0) return;
    let closestIdx = -1, closestDist = Infinity;
    shapes.forEach((s, i) => {
      const d = Math.hypot(s.x - pos.x, s.y - pos.y);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    });
    if (closestIdx !== -1 && closestDist < 15) {
      pushUndo();
      setShapes((s) => s.filter((_, i) => i !== closestIdx));
      setSelectedShapeIndex(null);
    }
  };

  const pushUndo = () => { setUndoStack((u) => [...u, shapes]); setRedoStack([]); };
  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, shapes]);
    setShapes(prev);
    setSelectedShapeIndex(null);
  };
  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, shapes]);
    setShapes(next);
    setSelectedShapeIndex(null);
  };
  const resetAll = () => { pushUndo(); setShapes([]); setSelectedShapeIndex(null); };

  // ── Save ───────────────────────────────────────────────────────────────
  const saveImage = () => {
    if (!canvasRef.current || !workingCanvasUrl) return;
    // Final synchronous render before export
    if (baseImgRef.current) drawCanvas(baseImgRef.current, shapes, canvasDimensions);
    setTimeout(() => {
      const { width: w, height: h } = canvasDimensions;
      const rounded = document.createElement("canvas");
      rounded.width = w; rounded.height = h;
      const rctx = rounded.getContext("2d");
      roundedRectPath(rctx, 0, 0, w, h, CORNER_RADIUS);
      rctx.clip();
      rctx.drawImage(canvasRef.current, 0, 0);
      rounded.toBlob((blob) => {
        const cropData = currentCropData || { x: 0, y: 0, width: 100, height: 100 };
        onSave({ blob, cropData, shapes, newOriginalFile: changedFile || null });
      }, "image/png");
    }, 50);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Edit Photo</h3>
          <button className="btn-link" onClick={onClose}>✕ Close</button>
        </div>

        <div className="modal-body">
          {/* ── Persistent toolbar ── */}
          <div className="editor-toolbar">
            <button
              className={tool === "select" ? "tool-btn active" : "tool-btn"}
              onClick={() => setTool("select")}
              disabled={cropMode}
              title="Select / Move mode (pan photo when zoomed)"
            >🖐️ Select / Pan</button>
            <button
              className={tool === "circle" ? "tool-btn active" : "tool-btn"}
              onClick={() => setTool("circle")}
              disabled={cropMode}
              title="Draw a circle to mark damage"
            >⭕ Circle</button>
            <button
              className={tool === "erase" ? "tool-btn active" : "tool-btn"}
              onClick={() => setTool("erase")}
              disabled={cropMode}
              title="Click a circle to erase it"
            >🩹 Erase</button>
            <label className="thickness-control">
              Thickness
              <input
                type="range" min="1" max="12" value={thickness}
                disabled={cropMode}
                onChange={(e) => setThickness(Number(e.target.value))}
              />
              <span>{thickness}px</span>
            </label>
            <button className="tool-btn" onClick={undo} disabled={cropMode || undoStack.length === 0}>↩ Undo</button>
            <button className="tool-btn" onClick={redo} disabled={cropMode || redoStack.length === 0}>↪ Redo</button>
            <button className="tool-btn" onClick={resetAll} disabled={cropMode}>⟲ Reset</button>

            <div className="toolbar-sep" />

            <button
              className="tool-btn"
              onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
              disabled={cropMode}
              title="Zoom In"
            >🔍 +</button>
            <span className="zoom-level-text">{Math.round(zoom * 100)}%</span>
            <button
              className="tool-btn"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
              disabled={cropMode}
              title="Zoom Out"
            >🔍 -</button>
            {zoom !== 1 && (
              <button
                className="tool-btn"
                onClick={() => setZoom(1)}
                disabled={cropMode}
                title="Reset Zoom"
              >100%</button>
            )}

            <div className="toolbar-sep" />

            <button
              className={cropMode ? "tool-btn active" : "tool-btn"}
              onClick={cropMode ? () => setCropMode(false) : enterCropMode}
              title="Crop the photo"
            >✂ Crop</button>
            <button
              className="tool-btn"
              disabled={cropMode}
              onClick={() => changeImgInputRef.current?.click()}
              title="Replace this photo with a different file"
            >🖼 Change</button>
            <input
              ref={changeImgInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleChangeImageFile}
            />
          </div>

          {/* ── Unified Editor Workspace Window ── */}
          <div className="editor-workspace" ref={workspaceRef}>
            {cropMode ? (
              <div className="crop-workspace">
                {srcImg ? (
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={freeAspect ? undefined : FRAME_ASPECT}
                  >
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <img
                      ref={imgRef}
                      src={currentSourceUrl}
                      crossOrigin="anonymous"
                      style={{ maxWidth: "100%", maxHeight: "60vh", display: "block" }}
                    />
                  </ReactCrop>
                ) : (
                  <div className="canvas-loading">Loading original image…</div>
                )}
                <div className="crop-actions">
                  <button className="tool-btn" onClick={() => setCropMode(false)}>✕ Cancel</button>
                  <button className="btn-primary" onClick={applyCrop} disabled={!completedCrop}>
                    ✓ Apply Crop
                  </button>
                </div>
              </div>
            ) : (
              workingCanvasUrl ? (
                <div className="canvas-zoom-container">
                  <canvas
                    ref={canvasRef}
                    width={canvasDimensions.width}
                    height={canvasDimensions.height}
                    className="editor-canvas"
                    style={{
                      transform: `translate(${panPos.x}px, ${panPos.y}px) scale(${zoom})`,
                      transformOrigin: "center center",
                      touchAction: "none",
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  />
                </div>
              ) : (
                <div className="canvas-loading">Loading image…</div>
              )
            )}
          </div>

          <div className="modal-actions">
            <button className="btn-primary" onClick={saveImage} disabled={cropMode || !workingCanvasUrl}>
              💾 Save Image
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}