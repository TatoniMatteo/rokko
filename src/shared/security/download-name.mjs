export function safeDownloadName(value) {
  if(typeof value!=='string')return 'download';
  let name=value.split(/[\\/]/).pop().normalize('NFC').replace(/[^\p{L}\p{N}._ ()-]/gu,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,128);
  if(!name)name='download';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='download-'+name;
  return name;
}
