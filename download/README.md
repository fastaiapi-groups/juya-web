服务器安装包目录为 /opt/fastaiapi-groups/juya-web/download，在面板文件管理器中进入该目录并上传三个安装包。
在 .env 中设置 DOWNLOADS_DIR=/opt/fastaiapi-groups/juya-web/download，并在 ../config/site.json 的 downloads 中配置对应文件名。
安装包不要提交到 Git。网站只提供 EXE / DMG / ZIP / AppImage / DEB / RPM 文件下载。
