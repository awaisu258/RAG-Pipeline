export const buildContext = (chunks) => {
    let data = "";
    chunks.points.forEach((item) => {
        data += item.payload.text + "source =" + "filePath : " + item.payload.filePath + ", Paragraph :" + item.payload.paragraph
    });
    return data;
}