export function applyCameraIntrinsics(camera, { width, height, intrinsics }) {
  const { fx, fy, ox, oy } = intrinsics;
  if (![width, height, fx, fy, ox, oy].every(Number.isFinite) ||
      Math.min(width, height, fx, fy) <= 0) return false;
  const { near, far } = camera;
  camera.projectionMatrix.makePerspective(
    -ox * near / fx, (width - ox) * near / fx,
    oy * near / fy, -(height - oy) * near / fy, near, far,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return true;
}

export function setupPlacement(THREE, camera, scene) {
  const panel = document.querySelector('#placement');
  const reticle = document.querySelector('#placementAim');
  const message = document.querySelector('#placementMessage');
  const distance = document.querySelector('#placementDistance');
  const place = document.querySelector('#placeObject');
  const remove = document.querySelector('#removeObject');
  const anchor = new THREE.Group();
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(.18, .18, .18),
    new THREE.MeshBasicMaterial({color: 0xff832f}),
  );
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(cube.geometry),
    new THREE.LineBasicMaterial({color: 0xffffff}),
  );
  cube.add(outline);
  anchor.add(cube);
  anchor.visible = false;
  scene.add(anchor);
  panel.hidden = false;
  reticle.hidden = false;

  let placed = false;
  let tracked = false;
  const aim = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  function updateControls() {
    place.disabled = !tracked;
    remove.disabled = !placed;
    reticle.classList.toggle('ready', tracked);
    if (!tracked) message.textContent = placed ? '定位暫失 · 對準原掃描區域以恢復顯示' : '等待定位 · 請對準掃描過的座位';
    else if (placed) message.textContent = '已固定 · 左右移動手機，確認方塊留在原處';
    else message.textContent = '可以放置 · 用準星對準目標，選擇估計距離';
  }
  place.onclick = () => {
    if (!tracked) return;
    camera.updateMatrixWorld();
    ray.setFromCamera(aim, camera);
    ray.ray.at(Number(distance.value), anchor.position);
    placed = true;
    anchor.visible = true;
    updateControls();
  };
  remove.onclick = () => {
    placed = false;
    anchor.visible = false;
    updateControls();
  };
  updateControls();
  return ready => {
    if (ready === tracked) return;
    tracked = ready;
    anchor.visible = tracked && placed;
    updateControls();
  };
}
