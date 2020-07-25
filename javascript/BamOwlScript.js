// JavaScript source code

function dropdown() {
    document.getElementById("myDropdown").classList.toggle("show");
}
window.onclick = function (event) {
    if (!event.target.matches('.dropbtn')) {

        var dropdowns = document.getElementsByClassName("dropdown-content");
        var i;
        for (i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}
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