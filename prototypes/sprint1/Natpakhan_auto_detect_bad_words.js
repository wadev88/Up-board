/* ==========================================
   Natpakhan_auto_detect_bad_words.js
   PART 1
========================================== */

// -------------------------------
// Toast
// -------------------------------

const toast = document.getElementById("toast");

function showToast(message) {

    toast.textContent = message;

    toast.classList.remove("hidden");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {

        toast.classList.add("hidden");

    },3000);

}

// -------------------------------
// Navigation
// -------------------------------

const navButtons = document.querySelectorAll(".nav-item");

const cards = document.querySelectorAll(".card");

navButtons.forEach((button,index)=>{

    button.addEventListener("click",()=>{

        navButtons.forEach(btn=>{

            btn.classList.remove("active");

        });

        button.classList.add("active");

        cards.forEach(card=>{

            card.style.display="none";

        });

        if(index===0){

            cards.forEach(card=>{

                card.style.display="block";

            });

        }

        else{

            const target=cards[index-1];

            if(target){

                target.style.display="block";

            }

        }

    });

});

// -------------------------------
// Toggle
// -------------------------------

const offensiveToggle=document.getElementById("toggleOffensiveRule");

const spamToggle=document.getElementById("toggleSpamRule");

const offensiveSection=document.getElementById("offensiveSection");

const spamSection=document.getElementById("spamSection");

function updateToggle(toggle,section){

    if(toggle.checked){

        section.style.opacity="1";

        section.style.pointerEvents="auto";

    }

    else{

        section.style.opacity=".4";

        section.style.pointerEvents="none";

    }

}

updateToggle(offensiveToggle,offensiveSection);

updateToggle(spamToggle,spamSection);

offensiveToggle.addEventListener("change",()=>{

    updateToggle(offensiveToggle,offensiveSection);

});

spamToggle.addEventListener("change",()=>{

    updateToggle(spamToggle,spamSection);

});

// -------------------------------
// Dashboard
// -------------------------------

const lastUpdate=document.getElementById("lastUpdate");

function updateDashboard(){

    let enabled=0;

    if(document.getElementById("enableMaxLimit").checked){

        enabled++;

    }

    if(offensiveToggle.checked){

        enabled++;

    }

    if(spamToggle.checked){

        enabled++;

    }

    document.querySelectorAll(".stat-card strong")[0].textContent="4";

    document.querySelectorAll(".stat-card strong")[1].textContent=enabled;

    document.querySelectorAll(".stat-card strong")[2].textContent=4-enabled;

    lastUpdate.textContent=new Date().toLocaleString("th-TH");

}

updateDashboard();

// -------------------------------
// Slider
// -------------------------------

const severitySlider=document.getElementById("severitySlider");

severitySlider.title=severitySlider.value;

severitySlider.addEventListener("input",()=>{

    severitySlider.title="ระดับความรุนแรง : "+severitySlider.value;

});

// -------------------------------
// Input Events
// -------------------------------

document.querySelectorAll("input").forEach(input=>{

    input.addEventListener("change",()=>{

        updateDashboard();

    });

});

// ===== END PART 1 =====
/* ==========================================
   PART 2
   Save / Load / Validation
========================================== */

// -------------------------------
// Buttons
// -------------------------------

const btnSave = document.getElementById("btnSave");
const btnSaveBottom = document.getElementById("btnSaveBottom");
const btnDiscard = document.getElementById("btnDiscard");

// -------------------------------
// Save Data
// -------------------------------

function getFormData() {

    return {

        enableMaxLimit:
            document.getElementById("enableMaxLimit").checked,

        maxWords:
            document.getElementById("maxWords").value,

        maxChars:
            document.getElementById("maxChars").value,

        action:
            document.querySelector(
                "input[name='actionOnFailure']:checked"
            ).value,

        offensive:
            offensiveToggle.checked,

        blacklist:
            document.getElementById("blocklistInput").value,

        severity:
            severitySlider.value,

        aiDetection:
            document.getElementById("aiDetection").checked,

        spam:
            spamToggle.checked,

        repeat:
            document.getElementById("repeatDetection").checked,

        link:
            document.getElementById("linkCheck").checked,

        frequency:
            document.getElementById("frequencyCheck").checked,

        regex:
            document.getElementById("regexInput").value

    };

}

function saveData() {

    const data = getFormData();

    localStorage.setItem(
        "validationRules",
        JSON.stringify(data)
    );

    updateDashboard();

    showToast("✔ บันทึกข้อมูลเรียบร้อย");

}

btnSave.addEventListener("click", saveData);

btnSaveBottom.addEventListener("click", saveData);

// -------------------------------
// Load
// -------------------------------

function loadData() {

    const data =
        JSON.parse(
            localStorage.getItem("validationRules")
        );

    if (!data) return;

    document.getElementById("enableMaxLimit").checked =
        data.enableMaxLimit;

    document.getElementById("maxWords").value =
        data.maxWords;

    document.getElementById("maxChars").value =
        data.maxChars;

    document.querySelector(
        `input[name='actionOnFailure'][value='${data.action}']`
    ).checked = true;

    offensiveToggle.checked =
        data.offensive;

    spamToggle.checked =
        data.spam;

    document.getElementById("blocklistInput").value =
        data.blacklist;

    severitySlider.value =
        data.severity;

    document.getElementById("aiDetection").checked =
        data.aiDetection;

    document.getElementById("repeatDetection").checked =
        data.repeat;

    document.getElementById("linkCheck").checked =
        data.link;

    document.getElementById("frequencyCheck").checked =
        data.frequency;

    document.getElementById("regexInput").value =
        data.regex;

    updateToggle(
        offensiveToggle,
        offensiveSection
    );

    updateToggle(
        spamToggle,
        spamSection
    );

    updateDashboard();

}

// -------------------------------
// Validation
// -------------------------------

function validateForm() {

    const maxWords =
        Number(document.getElementById("maxWords").value);

    const maxChars =
        Number(document.getElementById("maxChars").value);

    if (maxWords <= 0) {

        showToast("จำนวนคำต้องมากกว่า 0");

        return false;

    }

    if (maxChars <= 0) {

        showToast("จำนวนตัวอักษรต้องมากกว่า 0");

        return false;

    }

    if (
        offensiveToggle.checked &&
        document.getElementById("blocklistInput").value.trim() === ""
    ) {

        showToast("กรุณากรอก Blacklist");

        return false;

    }

    return true;

}

btnSave.addEventListener("click", () => {

    if (validateForm()) {

        saveData();

    }

});

btnSaveBottom.addEventListener("click", () => {

    if (validateForm()) {

        saveData();

    }

});

// ===== END PART 2 =====
/* ==========================================
   PART 3
   Reset / Auto Save / Workflow / Init
========================================== */

// -------------------------------
// Reset
// -------------------------------

function resetForm() {

    if (!confirm("คุณต้องการรีเซ็ตการตั้งค่าทั้งหมดหรือไม่ ?")) {

        return;

    }

    localStorage.removeItem("validationRules");

    document.getElementById("enableMaxLimit").checked = true;

    document.getElementById("maxWords").value = 100;

    document.getElementById("maxChars").value = 500;

    document.querySelector(
        "input[name='actionOnFailure'][value='block']"
    ).checked = true;

    offensiveToggle.checked = true;

    spamToggle.checked = true;

    document.getElementById("blocklistInput").value = "";

    severitySlider.value = 5;

    document.getElementById("aiDetection").checked = false;

    document.getElementById("repeatDetection").checked = true;

    document.getElementById("linkCheck").checked = true;

    document.getElementById("frequencyCheck").checked = false;

    document.getElementById("regexInput").value = "";

    updateToggle(
        offensiveToggle,
        offensiveSection
    );

    updateToggle(
        spamToggle,
        spamSection
    );

    updateDashboard();

    showToast("รีเซ็ตข้อมูลเรียบร้อย");

}

btnDiscard.addEventListener("click", resetForm);

// -------------------------------
// Auto Save (optional)
// -------------------------------

document.querySelectorAll("input").forEach((input) => {

    input.addEventListener("change", () => {

        updateDashboard();

    });

});

// -------------------------------
// Keyboard Shortcut
// -------------------------------

document.addEventListener("keydown", (event) => {

    if (event.ctrlKey && event.key === "s") {

        event.preventDefault();

        if (validateForm()) {

            saveData();

        }

    }

});

// -------------------------------
// Workflow Animation
// -------------------------------

const workflowSteps =
    document.querySelectorAll(".flow-step");

workflowSteps.forEach((step, index) => {

    step.style.opacity = "0";

    step.style.transform = "translateY(15px)";

    setTimeout(() => {

        step.style.transition =
            "all .35s ease";

        step.style.opacity = "1";

        step.style.transform =
            "translateY(0px)";

    }, index * 150);

});

// -------------------------------
// Card Hover Effect
// -------------------------------

document.querySelectorAll(".card").forEach(card => {

    card.addEventListener("mouseenter", () => {

        card.style.transform = "translateY(-3px)";

        card.style.transition = ".25s";

    });

    card.addEventListener("mouseleave", () => {

        card.style.transform = "translateY(0px)";

    });

});

// -------------------------------
// Last Update Timer
// -------------------------------

setInterval(() => {

    lastUpdate.textContent =
        new Date().toLocaleString("th-TH");

}, 60000);

// -------------------------------
// Init
// -------------------------------

window.addEventListener("load", () => {

    loadData();

    updateDashboard();

    showToast("ระบบพร้อมใช้งาน");

});

console.log("====================================");
console.log("Validation Rules Dashboard Loaded");
console.log("Developer : NATPAKHAN");
console.log("Version : 1.0");
console.log("====================================");

// ===== END PART 3 =====
