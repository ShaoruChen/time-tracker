const FAN_OUTER_R = 150;
const FAN_INNER_R = 42;

export class FanMenu {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.sectors = [];
    this.onSectorClick = null;
    this.selectedId = null;
  }

  clear() {
    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }
    this.sectors = [];
    this.selectedId = null;
    this.container.classList.remove('visible', 'has-selection');
  }

  show(items, opts = {}) {
    const { backLabel = null, selectedId = null, backColor = '#888' } = opts;
    this.clear();
    this.selectedId = selectedId;

    const totalItems = items.length + (backLabel ? 1 : 0);
    if (totalItems === 0) return;

    const arcAngle = this._clamp(360 / totalItems, 40, 90);
    const totalArc = arcAngle * totalItems;
    const startAngle = -90 - totalArc / 2 + arcAngle / 2;

    const size = FAN_OUTER_R * 2;
    this.svg = this._createSvg(size);

    let idx = 0;

    items.forEach((item) => {
      const midAngle = startAngle + idx * arcAngle;
      this._drawSector(item, midAngle, arcAngle, false);
      idx++;
    });

    if (backLabel) {
      const midAngle = startAngle + idx * arcAngle;
      this._drawSector(
        { id: '__back__', name: backLabel, color: backColor },
        midAngle,
        arcAngle,
        true
      );
    }

    this.container.appendChild(this.svg);
    this.container.classList.add('visible');

    if (this.selectedId) {
      this.container.classList.add('has-selection');
      this._updateSelectionVisual();
    }
  }

  hide() {
    this.container.classList.remove('visible', 'has-selection');
    setTimeout(() => this.clear(), 200);
  }

  _createSvg(size) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.position = 'absolute';
    svg.style.top = '50%';
    svg.style.left = '50%';
    svg.style.transform = 'translate(-50%, -50%)';
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';
    return svg;
  }

  _drawSector(item, midAngleDeg, arcAngleDeg, isBack) {
    const cx = FAN_OUTER_R;
    const cy = FAN_OUTER_R;
    const halfArc = arcAngleDeg / 2;

    const startA = midAngleDeg - halfArc;
    const endA = midAngleDeg + halfArc;

    const path = this._createWedgePath(cx, cy, FAN_INNER_R, FAN_OUTER_R, startA, endA);

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('fill', item.color || '#667eea');
    pathEl.setAttribute('stroke', 'rgba(255,255,255,0.3)');
    pathEl.setAttribute('stroke-width', '1.5');
    pathEl.setAttribute('data-id', item.id);
    if (isBack) {
      pathEl.setAttribute('opacity', '0.6');
      pathEl.classList.add('back-sector');
    }
    pathEl.style.cursor = 'pointer';
    pathEl.style.pointerEvents = 'auto';
    pathEl.style.transition = 'opacity 0.2s, filter 0.15s';

    pathEl.addEventListener('mouseenter', () => {
      pathEl.setAttribute('filter', 'brightness(1.15)');
    });
    pathEl.addEventListener('mouseleave', () => {
      pathEl.setAttribute('filter', 'none');
    });
    pathEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onSectorClick) {
        this.onSectorClick(item.id, isBack);
      }
    });

    this.svg.appendChild(pathEl);

    // Label
    const labelR = (FAN_INNER_R + FAN_OUTER_R) / 2;
    const midRad = (midAngleDeg * Math.PI) / 180;
    const lx = cx + labelR * Math.cos(midRad);
    const ly = cy + labelR * Math.sin(midRad);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', lx);
    text.setAttribute('y', ly);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', '600');
    text.setAttribute('pointer-events', 'none');
    text.textContent = item.name;

    // Rotate text if it would be upside-down
    let textRotation = midAngleDeg;
    if (textRotation > 90 || textRotation < -90) {
      textRotation += 180;
    }
    text.setAttribute('transform', `rotate(${textRotation}, ${lx}, ${ly})`);

    this.svg.appendChild(text);
    this.sectors.push({ id: item.id, path: pathEl, text });
  }

  _createWedgePath(cx, cy, innerR, outerR, startAngleDeg, endAngleDeg) {
    const startRad = (startAngleDeg * Math.PI) / 180;
    const endRad = (endAngleDeg * Math.PI) / 180;

    const x1o = cx + outerR * Math.cos(startRad);
    const y1o = cy + outerR * Math.sin(startRad);
    const x2o = cx + outerR * Math.cos(endRad);
    const y2o = cy + outerR * Math.sin(endRad);
    const x2i = cx + innerR * Math.cos(endRad);
    const y2i = cy + innerR * Math.sin(endRad);
    const x1i = cx + innerR * Math.cos(startRad);
    const y1i = cy + innerR * Math.sin(startRad);

    const largeArc = (endAngleDeg - startAngleDeg) > 180 ? 1 : 0;

    return [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x2i} ${y2i}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1i} ${y1i}`,
      'Z',
    ].join(' ');
  }

  highlightSelected(id) {
    this.selectedId = id;
    this._updateSelectionVisual();
  }

  _updateSelectionVisual() {
    this.sectors.forEach((s) => {
      if (s.id === this.selectedId) {
        s.path.setAttribute('filter', 'brightness(1.3) saturate(1.2)');
      } else {
        s.path.setAttribute('filter', 'none');
        s.path.setAttribute('opacity', '0.35');
      }
    });

    if (this.selectedId) {
      this.container.classList.add('has-selection');
    } else {
      this.container.classList.remove('has-selection');
    }
  }

  _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }
}
