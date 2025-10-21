alignImages = async function() {
	var images = [
		"/pengu-lost-and-wanted/assets/images/bunny_mech.webp",
		"/pengu-lost-and-wanted/assets/images/pengu_lost_and_wanted_banner.webp",
		"/pengu-lost-and-wanted/assets/images/screenshot1.jpg",
		"/pengu-lost-and-wanted/assets/images/screenshot2.jpg",
		"/pengu-lost-and-wanted/assets/images/screenshot3.jpg",
		"/pengu-lost-and-wanted/assets/images/bunny_mech.webp",
		"/pengu-lost-and-wanted/assets/images/combat_concept_sketch.png",
	];

	// load images to get natural sizes
    async function loadImg(src) {
        const img = new Image();
        img.src = src;
        try { await img.decode(); } catch(e) { /* ignore decode errors */ }
        return img;
    }

    const loaded = await Promise.all(images.map(loadImg));
    const ratios = loaded.map(i => (i.naturalWidth || 1) / (i.naturalHeight || 1));


	var section = document.querySelector(".gallery");

	var geometry = require("justified-layout")(
		ratios,
		{containerWidth:Math.max(1, section.clientWidth), containerPadding:0,boxSpacing:0}
	);

	var boxes = geometry.boxes
		.map(function (box,i) {
			return `<img src=${images[i]} class="box" style="width: ${box.width}px; height: ${box.height}px; top: ${box.top}px; left: ${box.left}px">`;
		})
		.join("");


	
	section.innerHTML = boxes;
	section.style.height = geometry.containerHeight + "px";
}

window.onload = async (event) => {
	alignImages();
};

window.onresize = async (event) => {
	alignImages();
}