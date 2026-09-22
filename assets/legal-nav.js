(function(){
  var el=document.querySelector('.nav-logo');
  if(!el)return;
  fetch('/api/config/site').then(function(r){return r.json()}).then(function(c){
    if(!c||!c.logo||!c.logo.src)return;
    var src=c.logo.src;
    var img=document.createElement('img');
    img.src=src;
    img.alt=c.siteName||'AEOX';
    img.className='nav-logo-img';
    img.style.maxHeight='28px';
    img.style.objectFit='contain';
    el.textContent='';
    el.appendChild(img);
  }).catch(function(){});
})();
