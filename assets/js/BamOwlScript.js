// JavaScript source code

function openNav() {
    document.getElementById("mySidenav").style.width = "230px";
}
function closeNav() {
    var element = document.getElementById("mySideList");
    element.classList.toggle("hidden");
}

function sideNav(x) {
    var element = document.getElementById("mySidenav");
    element.classList.toggle("sidenav");
    x.classList.toggle("change");

    var element2 = document.getElementById("mySideList");
    element2.classList.toggle("show");

    var element3 = document.getElementById("main");
    element3.classList.toggle("main-box2");
}

function hoverImage() {
}