const boardModels = {
	1: "Boosted Dual",
	2: "Boosted Dual+",
	3: "Boosted Plus",
	4: "Boosted Stealth",
	5: "Boosted Mini S",
	6: "Boosted Mini X",
	7: "Boosted Rev"
};

const rideModes = {
	0: "Beginner",
	1: "Eco",
	2: "Expert",
	3: "Pro",
	4: "Hyper"
};

const batteryModels = {
	0: "UNKNOWN 0",
	1: "B2SR",
	2: "UNKNOWN 2",
	3: "UNKNOWN 3",
	4: "UNKNOWN 4"
};

const valueElementIDs = [
	"status",
	"md-model",
	"md-firmware-version",
	"md-odo",
	"md-ride-modes",
	"md-current-ride-mode",
	"battery-model",
	"battery-firmware-version",
	"battery-soc"
];

function render(data) {
	for (let i = 0; i < valueElementIDs.length; i++) {
		document.getElementById(valueElementIDs[i]).textContent = data[valueElementIDs[i]] || document.getElementById(valueElementIDs[i]).textContent;
	}
}

const textDecoder = new TextDecoder("utf-8");

let serviceCache = {};
let characteristicCache = {};

async function getService(server, uuid) {
	if (serviceCache[uuid]) {
		return serviceCache[uuid];
	}

	serviceCache[uuid] = await server.getPrimaryService(uuid);
	return serviceCache[uuid];
}

async function getCharacteristicValue(service, uuid) {
	if (characteristicCache[uuid]) {
		return characteristicCache[uuid].readValue();
	}

	characteristicCache[uuid] = await service.getCharacteristic(uuid);
	return await characteristicCache[uuid].readValue();
}

async function readDeviceInfoData(server) {
	let data = {};

	const deviceInfoService = await getService(server, "0000180a-0000-1000-8000-00805f9b34fb");
	const mdFirmwareValue = await getCharacteristicValue(deviceInfoService, "00002a26-0000-1000-8000-00805f9b34fb");

	data["md-firmware-version"] = textDecoder.decode(mdFirmwareValue);

	return data;
}

async function readMDData(server) {
	let data = {};

	const mdService = await getService(server, "7dc55a86-c61f-11e5-9912-ba0be0483c18");
	const mdModelValue = await getCharacteristicValue(mdService, "7dc59643-c61f-11e5-9912-ba0be0483c18");
	const mdOdoValue = await getCharacteristicValue(mdService, "7dc56594-c61f-11e5-9912-ba0be0483c18");
	const mdRideModesValue = await getCharacteristicValue(mdService, "7dc55dec-c61f-11e5-9912-ba0be0483c18");
	const mdCurrentRideModeValue = await getCharacteristicValue(mdService, "7dc55f22-c61f-11e5-9912-ba0be0483c18");

	const model = mdModelValue.getUint8(0);

	data["md-model"] = boardModels[model];

	let miles = 0;
	if (model === 4 || model === 5) {
		miles = mdOdoValue.getUint32(0, true) * 3.6128E-5;
	} else if (model === 7) {
		miles = mdOdoValue.getUint32(0, true) * 6.2137273665E-4;
	} else {
		miles = mdOdoValue.getUint32(0, true) * 3.8386E-5;
	}

	data["md-odo"] = miles.toFixed(2) + " miles | " + (miles * 1.60934).toFixed(2) + " km";

	data["md-ride-modes"] = "";
	for (let i = 0; i < mdRideModesValue.getUint8(0); i++) {
		data["md-ride-modes"] += rideModes[i] + " ";
	}

	data["md-current-ride-mode"] = rideModes[mdCurrentRideModeValue.getUint8(0)];

	return data;
}

async function readBatteryData(server) {
	let data = {};

	const batteryService = await getService(server, "65a8eaa8-c61f-11e5-9912-ba0be0483c18");
	const batteryModelValue = await getCharacteristicValue(batteryService, "65a8f832-c61f-11e5-9912-ba0be0483c18");
	const batteryFirmwareValue = await getCharacteristicValue(batteryService, "65a8f833-c61f-11e5-9912-ba0be0483c18");
	const batterySOCValue = await getCharacteristicValue(batteryService, "65a8eeae-c61f-11e5-9912-ba0be0483c18");

	data["battery-model"] = batteryModels[batteryModelValue.getUint8(0)];
	data["battery-firmware-version"] = "v" + batteryFirmwareValue.getUint8(0) + "." + batteryFirmwareValue.getUint8(1) + "." + batteryFirmwareValue.getUint8(2);
	data["battery-soc"] = batterySOCValue.getUint8(0) + "%";

	return data;
}

async function onButtonClick() {
	render({status: "Waiting for device selection"});

	const device = await navigator.bluetooth.requestDevice({
		filters: [
			{
				services: ["7dc55a86-c61f-11e5-9912-ba0be0483c18"]
			}
		],
		optionalServices: [
			BluetoothUUID.getService("0000180a-0000-1000-8000-00805f9b34fb"),
			BluetoothUUID.getService("7dc55a86-c61f-11e5-9912-ba0be0483c18"),
			BluetoothUUID.getService("65a8eaa8-c61f-11e5-9912-ba0be0483c18")
		]
	});

	render({status: "Connecting to device..."});

	let server;
	let retries = 0;

	while (retries < 3) {
		try {
			server = await device.gatt.connect();
			await server.getPrimaryServices();

			render({status: "Reading data..."});

			serviceCache = {};
			characteristicCache = {};

			const deviceInfo = await readDeviceInfoData(server);
			const mdInfo = await readMDData(server);
			const batteryInfo = await readBatteryData(server);

			render({
				...deviceInfo,
				...mdInfo,
				...batteryInfo
			});

			render({status: "Connected"});

			break;
		} catch(error) {
			console.log("Error: " + error);
			console.log("Retrying...");
			retries++;
		}
	}


}