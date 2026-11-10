// Change navigation URLs only; never mutate signed release metadata.
export function installerHref(value:string):string {
 try {
  const url=new URL(value)
  if(url.origin==='https://fastaiapi.cloud'&&/^\/fastaiapi\/(?:manju-updates\/downloads\/manju|downloads\/codexplus)\//.test(url.pathname))return '/hub/home/services'+url.pathname.slice('/fastaiapi'.length)+url.search
 }catch{}
 return value
}
