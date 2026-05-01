import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex("tb_scenic_spot").delete();

  const now = Date.now();

  const spots = [
    // ── Beijing 北京 ──
    { name_zh: "故宫博物院", name_en: "Palace Museum (Forbidden City)", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "颐和园", name_en: "Summer Palace", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "天坛公园", name_en: "Temple of Heaven", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "八达岭长城", name_en: "Badaling Great Wall", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "明十三陵", name_en: "Ming Tombs", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "奥林匹克公园", name_en: "Olympic Park", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "圆明园", name_en: "Old Summer Palace", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 7, created_dt: now, record_status: "A" },
    { name_zh: "北京海洋馆", name_en: "Beijing Aquarium", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 8, created_dt: now, record_status: "A" },
    { name_zh: "慕田峪长城", name_en: "Mutianyu Great Wall", province: "北京市", city: "北京市", province_en: "Beijing", city_en: "Beijing", sort_order: 9, created_dt: now, record_status: "A" },

    // ── Tianjin 天津 ──
    { name_zh: "天津古文化街旅游区", name_en: "Tianjin Ancient Culture Street", province: "天津市", city: "天津市", province_en: "Tianjin", city_en: "Tianjin", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "天津盘山风景名胜区", name_en: "Panshan Scenic Area", province: "天津市", city: "天津市", province_en: "Tianjin", city_en: "Tianjin", sort_order: 2, created_dt: now, record_status: "A" },

    // ── Hebei 河北 ──
    { name_zh: "承德避暑山庄及周围寺庙", name_en: "Chengde Mountain Resort and Outlying Temples", province: "河北省", city: "承德市", province_en: "Hebei", city_en: "Chengde", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "秦皇岛老龙头", name_en: "Laolongtou (Old Dragon Head)", province: "河北省", city: "秦皇岛市", province_en: "Hebei", city_en: "Qinhuangdao", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "保定白洋淀景区", name_en: "Baiyangdian Lake", province: "河北省", city: "保定市", province_en: "Hebei", city_en: "Baoding", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "西柏坡纪念地", name_en: "Xibaipo Memorial Site", province: "河北省", city: "石家庄市", province_en: "Hebei", city_en: "Shijiazhuang", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "清西陵", name_en: "Western Qing Tombs", province: "河北省", city: "保定市", province_en: "Hebei", city_en: "Baoding", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "清东陵", name_en: "Eastern Qing Tombs", province: "河北省", city: "唐山市", province_en: "Hebei", city_en: "Tangshan", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "野三坡", name_en: "Yesanpo Scenic Area", province: "河北省", city: "保定市", province_en: "Hebei", city_en: "Baoding", sort_order: 7, created_dt: now, record_status: "A" },
    { name_zh: "苍岩山风景名胜区", name_en: "Cangyangshan Scenic Area", province: "河北省", city: "石家庄市", province_en: "Hebei", city_en: "Shijiazhuang", sort_order: 8, created_dt: now, record_status: "A" },

    // ── Shanxi 山西 ──
    { name_zh: "五台山风景名胜区", name_en: "Mount Wutai Scenic Area", province: "山西省", city: "忻州市", province_en: "Shanxi", city_en: "Xinzhou", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "云冈石窟", name_en: "Yungang Grottoes", province: "山西省", city: "大同市", province_en: "Shanxi", city_en: "Datong", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "平遥古城", name_en: "Pingyao Ancient City", province: "山西省", city: "晋中市", province_en: "Shanxi", city_en: "Jinzhong", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "壶口瀑布风景名胜区", name_en: "Hukou Waterfall Scenic Area", province: "山西省", city: "临汾市", province_en: "Shanxi", city_en: "Linfen", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "皇城相府生态文化旅游区", name_en: "Imperial Palace of Prime Minister Chen", province: "山西省", city: "晋城市", province_en: "Shanxi", city_en: "Jincheng", sort_order: 5, created_dt: now, record_status: "A" },

    // ── Inner Mongolia 内蒙古 ──
    { name_zh: "成吉思汗陵旅游区", name_en: "Genghis Khan Mausoleum", province: "内蒙古自治区", city: "鄂尔多斯市", province_en: "Inner Mongolia", city_en: "Ordos", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "阿尔山·柴河旅游景区", name_en: "Arxan–Chahe Scenic Area", province: "内蒙古自治区", city: "兴安盟", province_en: "Inner Mongolia", city_en: "Xing'an", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "满洲里中俄边境旅游区", name_en: "Manzhouli China–Russia Border Tourism Area", province: "内蒙古自治区", city: "呼伦贝尔市", province_en: "Inner Mongolia", city_en: "Hulunbuir", sort_order: 3, created_dt: now, record_status: "A" },

    // ── Liaoning 辽宁 ──
    { name_zh: "沈阳故宫博物院", name_en: "Shenyang Imperial Palace", province: "辽宁省", city: "沈阳市", province_en: "Liaoning", city_en: "Shenyang", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "大连老虎滩海洋公园", name_en: "Laohutan Ocean Park", province: "辽宁省", city: "大连市", province_en: "Liaoning", city_en: "Dalian", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "鞍山千山风景名胜区", name_en: "Qianshan Scenic Area", province: "辽宁省", city: "鞍山市", province_en: "Liaoning", city_en: "Anshan", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "本溪水洞风景名胜区", name_en: "Benxi Water Cave Scenic Area", province: "辽宁省", city: "本溪市", province_en: "Liaoning", city_en: "Benxi", sort_order: 4, created_dt: now, record_status: "A" },

    // ── Jilin 吉林 ──
    { name_zh: "长白山风景名胜区", name_en: "Changbai Mountain Scenic Area", province: "吉林省", city: "白山市", province_en: "Jilin", city_en: "Baishan", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "伪满皇宫博物院", name_en: "Puppet Manchukuo Imperial Palace Museum", province: "吉林省", city: "长春市", province_en: "Jilin", city_en: "Changchun", sort_order: 2, created_dt: now, record_status: "A" },

    // ── Heilongjiang 黑龙江 ──
    { name_zh: "哈尔滨冰雪大世界", name_en: "Harbin Ice and Snow World", province: "黑龙江省", city: "哈尔滨市", province_en: "Heilongjiang", city_en: "Harbin", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "镜泊湖风景名胜区", name_en: "Jingpo Lake Scenic Area", province: "黑龙江省", city: "牡丹江市", province_en: "Heilongjiang", city_en: "Mudanjiang", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "黑龙江五大连池风景区", name_en: "Wudalianchi Scenic Area", province: "黑龙江省", city: "黑河市", province_en: "Heilongjiang", city_en: "Heihe", sort_order: 3, created_dt: now, record_status: "A" },

    // ── Shanghai 上海 ──
    { name_zh: "上海野生动物园", name_en: "Shanghai Wild Animal Park", province: "上海市", city: "上海市", province_en: "Shanghai", city_en: "Shanghai", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "上海科技馆", name_en: "Shanghai Science and Technology Museum", province: "上海市", city: "上海市", province_en: "Shanghai", city_en: "Shanghai", sort_order: 2, created_dt: now, record_status: "A" },

    // ── Jiangsu 江苏 ──
    { name_zh: "夫子庙秦淮风光带", name_en: "Confucius Temple and Qinhuai River Scenic Belt", province: "江苏省", city: "南京市", province_en: "Jiangsu", city_en: "Nanjing", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "苏州园林(拙政园)", name_en: "Humble Administrator's Garden", province: "江苏省", city: "苏州市", province_en: "Jiangsu", city_en: "Suzhou", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "苏州园林(留园)", name_en: "Lingering Garden", province: "江苏省", city: "苏州市", province_en: "Jiangsu", city_en: "Suzhou", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "无锡鼋头渚风景区", name_en: "Yuantouzhu Scenic Area", province: "江苏省", city: "无锡市", province_en: "Jiangsu", city_en: "Wuxi", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "南京钟山风景名胜区", name_en: "Zhongshan Scenic Area", province: "江苏省", city: "南京市", province_en: "Jiangsu", city_en: "Nanjing", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "周庄古镇景区", name_en: "Zhouzhuang Ancient Town", province: "江苏省", city: "苏州市", province_en: "Jiangsu", city_en: "Suzhou", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "沙家浜·虞山尚湖旅游区", name_en: "Shajiabang–Yushan·Shanghu Tourism Area", province: "江苏省", city: "常熟市", province_en: "Jiangsu", city_en: "Changshu", sort_order: 7, created_dt: now, record_status: "A" },
    { name_zh: "扬州瘦西湖风景区", name_en: "Slender West Lake Scenic Area", province: "江苏省", city: "扬州市", province_en: "Jiangsu", city_en: "Yangzhou", sort_order: 8, created_dt: now, record_status: "A" },
    { name_zh: "南京明孝陵景区", name_en: "Ming Xiaoling Mausoleum", province: "江苏省", city: "南京市", province_en: "Jiangsu", city_en: "Nanjing", sort_order: 9, created_dt: now, record_status: "A" },
    { name_zh: "苏州金鸡湖景区", name_en: "Jinji Lake Scenic Area", province: "江苏省", city: "苏州市", province_en: "Jiangsu", city_en: "Suzhou", sort_order: 10, created_dt: now, record_status: "A" },
    { name_zh: "常州中华恐龙园", name_en: "China Dinosaur Park", province: "江苏省", city: "常州市", province_en: "Jiangsu", city_en: "Changzhou", sort_order: 11, created_dt: now, record_status: "A" },

    // ── Zhejiang 浙江 ──
    { name_zh: "杭州西湖风景名胜区", name_en: "West Lake Scenic Area", province: "浙江省", city: "杭州市", province_en: "Zhejiang", city_en: "Hangzhou", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "普陀山风景名胜区", name_en: "Mount Putuo Scenic Area", province: "浙江省", city: "舟山市", province_en: "Zhejiang", city_en: "Zhoushan", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "雁荡山风景名胜区", name_en: "Yandang Mountain Scenic Area", province: "浙江省", city: "温州市", province_en: "Zhejiang", city_en: "Wenzhou", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "千岛湖风景区", name_en: "Thousand Island Lake Scenic Area", province: "浙江省", city: "杭州市", province_en: "Zhejiang", city_en: "Hangzhou", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "横店影视城", name_en: "Hengdian World Studios", province: "浙江省", city: "金华市", province_en: "Zhejiang", city_en: "Jinhua", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "溪口·雪窦山风景名胜区", name_en: "Xikou–Xuedou Mountain Scenic Area", province: "浙江省", city: "宁波市", province_en: "Zhejiang", city_en: "Ningbo", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "乌镇景区", name_en: "Wuzhen Scenic Area", province: "浙江省", city: "嘉兴市", province_en: "Zhejiang", city_en: "Jiaxing", sort_order: 7, created_dt: now, record_status: "A" },
    { name_zh: "西塘古镇", name_en: "Xitang Ancient Town", province: "浙江省", city: "嘉兴市", province_en: "Zhejiang", city_en: "Jiaxing", sort_order: 8, created_dt: now, record_status: "A" },
    { name_zh: "楠溪江风景名胜区", name_en: "Nanxi River Scenic Area", province: "浙江省", city: "温州市", province_en: "Zhejiang", city_en: "Wenzhou", sort_order: 9, created_dt: now, record_status: "A" },
    { name_zh: "仙都风景名胜区", name_en: "Xiandu Scenic Area", province: "浙江省", city: "丽水市", province_en: "Zhejiang", city_en: "Lishui", sort_order: 10, created_dt: now, record_status: "A" },
    { name_zh: "江郎山风景名胜区", name_en: "Jianglang Mountain Scenic Area", province: "浙江省", city: "衢州市", province_en: "Zhejiang", city_en: "Quzhou", sort_order: 11, created_dt: now, record_status: "A" },

    // ── Anhui 安徽 ──
    { name_zh: "黄山风景区", name_en: "Huangshan (Yellow Mountain) Scenic Area", province: "安徽省", city: "黄山市", province_en: "Anhui", city_en: "Huangshan", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "九华山风景区", name_en: "Mount Jiuhua Scenic Area", province: "安徽省", city: "池州市", province_en: "Anhui", city_en: "Chizhou", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "天柱山风景名胜区", name_en: "Tianzhu Mountain Scenic Area", province: "安徽省", city: "安庆市", province_en: "Anhui", city_en: "Anqing", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "琅琊山风景名胜区", name_en: "Langya Mountain Scenic Area", province: "安徽省", city: "滁州市", province_en: "Anhui", city_en: "Chuzhou", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "西递·宏村景区", name_en: "Xidi and Hongcun Villages", province: "安徽省", city: "黄山市", province_en: "Anhui", city_en: "Huangshan", sort_order: 5, created_dt: now, record_status: "A" },

    // ── Fujian 福建 ──
    { name_zh: "武夷山风景名胜区", name_en: "Wuyi Mountain Scenic Area", province: "福建省", city: "南平市", province_en: "Fujian", city_en: "Nanping", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "厦门鼓浪屿风景名胜区", name_en: "Gulangyu Scenic Area", province: "福建省", city: "厦门市", province_en: "Fujian", city_en: "Xiamen", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "泰宁风景名胜区", name_en: "Taining Scenic Area", province: "福建省", city: "三明市", province_en: "Fujian", city_en: "Sanming", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "福建土楼旅游景区", name_en: "Fujian Tulou Scenic Area", province: "福建省", city: "龙岩市", province_en: "Fujian", city_en: "Longyan", sort_order: 4, created_dt: now, record_status: "A" },

    // ── Jiangxi 江西 ──
    { name_zh: "庐山风景名胜区", name_en: "Mount Lu Scenic Area", province: "江西省", city: "九江市", province_en: "Jiangxi", city_en: "Jiujiang", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "三清山风景名胜区", name_en: "Sanqing Mountain Scenic Area", province: "江西省", city: "上饶市", province_en: "Jiangxi", city_en: "Shangrao", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "井冈山风景名胜区", name_en: "Jinggangshan Scenic Area", province: "江西省", city: "吉安市", province_en: "Jiangxi", city_en: "Ji'an", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "龙虎山风景名胜区", name_en: "Longhu Mountain Scenic Area", province: "江西省", city: "鹰潭市", province_en: "Jiangxi", city_en: "Yingtan", sort_order: 4, created_dt: now, record_status: "A" },

    // ── Shandong 山东 ──
    { name_zh: "泰山景区", name_en: "Mount Tai Scenic Area", province: "山东省", city: "泰安市", province_en: "Shandong", city_en: "Tai'an", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "曲阜明故城(孔庙·孔林·孔府)", name_en: "Qufu Temple, Cemetery and Mansion of Confucius", province: "山东省", city: "曲阜市", province_en: "Shandong", city_en: "Qufu", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "青岛崂山风景名胜区", name_en: "Laoshan Scenic Area", province: "山东省", city: "青岛市", province_en: "Shandong", city_en: "Qingdao", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "蓬莱阁旅游区", name_en: "Penglai Pavilion Scenic Area", province: "山东省", city: "烟台市", province_en: "Shandong", city_en: "Yantai", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "刘公岛景区", name_en: "Liugong Island Scenic Area", province: "山东省", city: "威海市", province_en: "Shandong", city_en: "Weihai", sort_order: 5, created_dt: now, record_status: "A" },

    // ── Henan 河南 ──
    { name_zh: "嵩山少林景区", name_en: "Shaolin Temple at Mount Song", province: "河南省", city: "郑州市", province_en: "Henan", city_en: "Zhengzhou", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "洛阳龙门石窟", name_en: "Longmen Grottoes", province: "河南省", city: "洛阳市", province_en: "Henan", city_en: "Luoyang", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "云台山(焦作)风景名胜区", name_en: "Yuntai Mountain Scenic Area", province: "河南省", city: "焦作市", province_en: "Henan", city_en: "Jiaozuo", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "清明上河园", name_en: "Qingming Riverside Landscape Garden", province: "河南省", city: "开封市", province_en: "Henan", city_en: "Kaifeng", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "鸡公山风景区", name_en: "Jigong Mountain Scenic Area", province: "河南省", city: "信阳市", province_en: "Henan", city_en: "Xinyang", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "王屋山·云台山景区", name_en: "Wangwu Mountain Scenic Area", province: "河南省", city: "济源市", province_en: "Henan", city_en: "Jiyuan", sort_order: 6, created_dt: now, record_status: "A" },

    // ── Hubei 湖北 ──
    { name_zh: "武当山风景名胜区", name_en: "Wudang Mountain Scenic Area", province: "湖北省", city: "十堰市", province_en: "Hubei", city_en: "Shiyan", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "武汉东湖风景区", name_en: "East Lake Scenic Area", province: "湖北省", city: "武汉市", province_en: "Hubei", city_en: "Wuhan", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "三峡大坝旅游区", name_en: "Three Gorges Dam Scenic Area", province: "湖北省", city: "宜昌市", province_en: "Hubei", city_en: "Yichang", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "神农架旅游区", name_en: "Shennongjia Scenic Area", province: "湖北省", city: "神农架林区", province_en: "Hubei", city_en: "Shennongjia", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "恩施大峡谷景区", name_en: "Enshi Grand Canyon Scenic Area", province: "湖北省", city: "恩施市", province_en: "Hubei", city_en: "Enshi", sort_order: 5, created_dt: now, record_status: "A" },

    // ── Hunan 湖南 ──
    { name_zh: "张家界武陵源风景名胜区", name_en: "Zhangjiajie Wulingyuan Scenic Area", province: "湖南省", city: "张家界市", province_en: "Hunan", city_en: "Zhangjiajie", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "南岳衡山风景区", name_en: "Mount Heng Scenic Area", province: "湖南省", city: "衡阳市", province_en: "Hunan", city_en: "Hengyang", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "岳阳楼·洞庭湖风景名胜区", name_en: "Yueyang Tower–Dongting Lake Scenic Area", province: "湖南省", city: "岳阳市", province_en: "Hunan", city_en: "Yueyang", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "韶山旅游区", name_en: "Shaoshan Scenic Area", province: "湖南省", city: "湘潭市", province_en: "Hunan", city_en: "Xiangtan", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "凤凰古城旅游区", name_en: "Fenghuang Ancient City", province: "湖南省", city: "湘西自治州", province_en: "Hunan", city_en: "Xiangxi", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "天门山景区", name_en: "Tianmen Mountain Scenic Area", province: "湖南省", city: "张家界市", province_en: "Hunan", city_en: "Zhangjiajie", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "崀山景区", name_en: "Langshan Scenic Area", province: "湖南省", city: "邵阳市", province_en: "Hunan", city_en: "Shaoyang", sort_order: 7, created_dt: now, record_status: "A" },

    // ── Guangdong 广东 ──
    { name_zh: "广州长隆旅游度假区", name_en: "Guangzhou Chimelong Tourist Resort", province: "广东省", city: "广州市", province_en: "Guangdong", city_en: "Guangzhou", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "深圳华侨城旅游度假区", name_en: "OCT Resort Shenzhen", province: "广东省", city: "深圳市", province_en: "Guangdong", city_en: "Shenzhen", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "丹霞山风景名胜区", name_en: "Danxia Mountain Scenic Area", province: "广东省", city: "韶关市", province_en: "Guangdong", city_en: "Shaoguan", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "肇庆星湖旅游景区", name_en: "Zhaoqing Star Lake Scenic Area", province: "广东省", city: "肇庆市", province_en: "Guangdong", city_en: "Zhaoqing", sort_order: 4, created_dt: now, record_status: "A" },

    // ── Guangxi 广西 ──
    { name_zh: "桂林漓江风景名胜区", name_en: "Guilin Li River Scenic Area", province: "广西壮族自治区", city: "桂林市", province_en: "Guangxi", city_en: "Guilin", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "桂林乐满地度假世界", name_en: "Guilin Merryland Resort", province: "广西壮族自治区", city: "桂林市", province_en: "Guangxi", city_en: "Guilin", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "北海银滩旅游区", name_en: "Beihai Silver Beach", province: "广西壮族自治区", city: "北海市", province_en: "Guangxi", city_en: "Beihai", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "德天跨国大瀑布旅游区", name_en: "Detian Transnational Waterfall", province: "广西壮族自治区", city: "崇左市", province_en: "Guangxi", city_en: "Chongzuo", sort_order: 4, created_dt: now, record_status: "A" },

    // ── Hainan 海南 ──
    { name_zh: "三亚南山文化旅游区", name_en: "Sanya Nanshan Cultural Tourism Zone", province: "海南省", city: "三亚市", province_en: "Hainan", city_en: "Sanya", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "呀诺达雨林文化旅游区", name_en: "Yanoda Rainforest Cultural Tourism Zone", province: "海南省", city: "三亚市", province_en: "Hainan", city_en: "Sanya", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "蜈支洲岛旅游区", name_en: "Wuzhizhou Island", province: "海南省", city: "三亚市", province_en: "Hainan", city_en: "Sanya", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "三亚亚龙湾旅游区", name_en: "Yalong Bay Scenic Area", province: "海南省", city: "三亚市", province_en: "Hainan", city_en: "Sanya", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "博鳌旅游区", name_en: "Boao Tourism Zone", province: "海南省", city: "琼海市", province_en: "Hainan", city_en: "Qionghai", sort_order: 5, created_dt: now, record_status: "A" },

    // ── Chongqing 重庆 ──
    { name_zh: "武隆喀斯特旅游区", name_en: "Wulong Karst Tourism Area", province: "重庆市", city: "重庆市", province_en: "Chongqing", city_en: "Chongqing", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "大足石刻旅游区", name_en: "Dazu Rock Carvings Tourism Area", province: "重庆市", city: "重庆市", province_en: "Chongqing", city_en: "Chongqing", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "缙云山国家级自然保护区", name_en: "Jinyun Mountain Nature Reserve", province: "重庆市", city: "重庆市", province_en: "Chongqing", city_en: "Chongqing", sort_order: 3, created_dt: now, record_status: "A" },

    // ── Sichuan 四川 ──
    { name_zh: "九寨沟风景名胜区", name_en: "Jiuzhaigou Valley Scenic Area", province: "四川省", city: "阿坝藏族羌族自治州", province_en: "Sichuan", city_en: "Aba", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "黄龙风景名胜区", name_en: "Huanglong Scenic Area", province: "四川省", city: "阿坝藏族羌族自治州", province_en: "Sichuan", city_en: "Aba", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "峨眉山景区", name_en: "Mount Emei Scenic Area", province: "四川省", city: "乐山市", province_en: "Sichuan", city_en: "Leshan", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "乐山大佛景区", name_en: "Leshan Giant Buddha Scenic Area", province: "四川省", city: "乐山市", province_en: "Sichuan", city_en: "Leshan", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "都江堰景区", name_en: "Dujiangyan Scenic Area", province: "四川省", city: "成都市", province_en: "Sichuan", city_en: "Chengdu", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "青城山景区", name_en: "Mount Qingcheng Scenic Area", province: "四川省", city: "成都市", province_en: "Sichuan", city_en: "Chengdu", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "剑门蜀道景区", name_en: "Jianmen Shudao Scenic Area", province: "四川省", city: "广元市", province_en: "Sichuan", city_en: "Guangyuan", sort_order: 7, created_dt: now, record_status: "A" },
    { name_zh: "光雾山·诺水河景区", name_en: "Guangwushan–Nuoshuihe Scenic Area", province: "四川省", city: "巴中市", province_en: "Sichuan", city_en: "Bazhong", sort_order: 8, created_dt: now, record_status: "A" },
    { name_zh: "稻城亚丁景区", name_en: "Daocheng Yading Scenic Area", province: "四川省", city: "甘孜藏族自治州", province_en: "Sichuan", city_en: "Garzê", sort_order: 9, created_dt: now, record_status: "A" },

    // ── Guizhou 贵州 ──
    { name_zh: "黄果树大瀑布景区", name_en: "Huangguoshu Waterfall Scenic Area", province: "贵州省", city: "安顺市", province_en: "Guizhou", city_en: "Anshun", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "西江苗寨旅游景区", name_en: "Xijiang Miao Village", province: "贵州省", city: "黔东南苗族侗族自治州", province_en: "Guizhou", city_en: "Qiandongnan", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "赤水丹霞旅游景区", name_en: "Chishui Danxia Scenic Area", province: "贵州省", city: "遵义市", province_en: "Guizhou", city_en: "Zunyi", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "荔波大小七孔景区", name_en: "Libo Big and Small Seven Holes Scenic Area", province: "贵州省", city: "黔南布依族苗族自治州", province_en: "Guizhou", city_en: "Qiannan", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "遵义会议纪念地", name_en: "Zunyi Conference Memorial Site", province: "贵州省", city: "遵义市", province_en: "Guizhou", city_en: "Zunyi", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "梵净山景区", name_en: "Fanjing Mountain Scenic Area", province: "贵州省", city: "铜仁市", province_en: "Guizhou", city_en: "Tongren", sort_order: 6, created_dt: now, record_status: "A" },

    // ── Yunnan 云南 ──
    { name_zh: "丽江古城景区", name_en: "Lijiang Old Town", province: "云南省", city: "丽江市", province_en: "Yunnan", city_en: "Lijiang", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "西双版纳热带雨林国家公园", name_en: "Xishuangbanna Tropical Rainforest National Park", province: "云南省", city: "西双版纳傣族自治州", province_en: "Yunnan", city_en: "Xishuangbanna", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "石林风景名胜区", name_en: "Stone Forest Scenic Area", province: "云南省", city: "昆明市", province_en: "Yunnan", city_en: "Kunming", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "大理苍山洱海国家级风景名胜区", name_en: "Cangshan Mountain and Erhai Lake Scenic Area", province: "云南省", city: "大理白族自治州", province_en: "Yunnan", city_en: "Dali", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "昆明滇池旅游区", name_en: "Dianchi Lake Tourism Area", province: "云南省", city: "昆明市", province_en: "Yunnan", city_en: "Kunming", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "三江并流风景名胜区", name_en: "Three Parallel Rivers Scenic Area", province: "云南省", city: "迪庆藏族自治州", province_en: "Yunnan", city_en: "Diqing", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "腾冲火山热海旅游区", name_en: "Tengchong Volcano and Hot Springs", province: "云南省", city: "保山市", province_en: "Yunnan", city_en: "Baoshan", sort_order: 7, created_dt: now, record_status: "A" },
    { name_zh: "香格里拉普达措国家公园", name_en: "Pudacuo National Park", province: "云南省", city: "迪庆藏族自治州", province_en: "Yunnan", city_en: "Diqing", sort_order: 8, created_dt: now, record_status: "A" },

    // ── Tibet 西藏 ──
    { name_zh: "拉萨布达拉宫历史建筑群", name_en: "Potala Palace Historic Ensemble", province: "西藏自治区", city: "拉萨市", province_en: "Tibet", city_en: "Lhasa", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "雅鲁藏布大峡谷旅游景区", name_en: "Yarlung Tsangpo Grand Canyon Scenic Area", province: "西藏自治区", city: "林芝市", province_en: "Tibet", city_en: "Nyingchi", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "纳木错风景名胜区", name_en: "Nam Co Scenic Area", province: "西藏自治区", city: "拉萨市", province_en: "Tibet", city_en: "Lhasa", sort_order: 3, created_dt: now, record_status: "A" },

    // ── Shaanxi 陕西 ──
    { name_zh: "秦始皇兵马俑博物馆", name_en: "Emperor Qinshihuang's Mausoleum Site Museum", province: "陕西省", city: "西安市", province_en: "Shaanxi", city_en: "Xi'an", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "华山风景名胜区", name_en: "Huashan Scenic Area", province: "陕西省", city: "渭南市", province_en: "Shaanxi", city_en: "Weinan", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "黄帝陵旅游区", name_en: "Huangdi Mausoleum Scenic Area", province: "陕西省", city: "延安市", province_en: "Shaanxi", city_en: "Yan'an", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "延安革命纪念地景区", name_en: "Yan'an Revolutionary Memorial Site", province: "陕西省", city: "延安市", province_en: "Shaanxi", city_en: "Yan'an", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "骊山·华清宫景区", name_en: "Lishan–Huaqing Palace Scenic Area", province: "陕西省", city: "西安市", province_en: "Shaanxi", city_en: "Xi'an", sort_order: 5, created_dt: now, record_status: "A" },

    // ── Gansu 甘肃 ──
    { name_zh: "敦煌莫高窟", name_en: "Mogao Caves", province: "甘肃省", city: "酒泉市", province_en: "Gansu", city_en: "Jiuquan", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "嘉峪关文物景区", name_en: "Jiayuguan Scenic Area", province: "甘肃省", city: "嘉峪关市", province_en: "Gansu", city_en: "Jiayuguan", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "麦积山风景名胜区", name_en: "Maiji Mountain Scenic Area", province: "甘肃省", city: "天水市", province_en: "Gansu", city_en: "Tianshui", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "崆峒山风景名胜区", name_en: "Kongtong Mountain Scenic Area", province: "甘肃省", city: "平凉市", province_en: "Gansu", city_en: "Pingliang", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "鸣沙山·月牙泉景区", name_en: "Mingsha Mountain and Crescent Moon Spring", province: "甘肃省", city: "酒泉市", province_en: "Gansu", city_en: "Jiuquan", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "张掖丹霞国家地质公园", name_en: "Zhangye Danxia National Geological Park", province: "甘肃省", city: "张掖市", province_en: "Gansu", city_en: "Zhangye", sort_order: 6, created_dt: now, record_status: "A" },

    // ── Qinghai 青海 ──
    { name_zh: "青海湖风景名胜区", name_en: "Qinghai Lake Scenic Area", province: "青海省", city: "海南藏族自治州", province_en: "Qinghai", city_en: "Hainan", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "塔尔寺景区", name_en: "Ta'er Monastery Scenic Area", province: "青海省", city: "西宁市", province_en: "Qinghai", city_en: "Xining", sort_order: 2, created_dt: now, record_status: "A" },

    // ── Ningxia 宁夏 ──
    { name_zh: "沙坡头旅游景区", name_en: "Shapotou Scenic Area", province: "宁夏回族自治区", city: "中卫市", province_en: "Ningxia", city_en: "Zhongwei", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "西夏王陵风景名胜区", name_en: "Western Xia Imperial Tombs", province: "宁夏回族自治区", city: "银川市", province_en: "Ningxia", city_en: "Yinchuan", sort_order: 2, created_dt: now, record_status: "A" },

    // ── Xinjiang 新疆 ──
    { name_zh: "天山天池风景名胜区", name_en: "Tianchi Lake (Heavenly Lake) Scenic Area", province: "新疆维吾尔自治区", city: "昌吉回族自治州", province_en: "Xinjiang", city_en: "Changji", sort_order: 1, created_dt: now, record_status: "A" },
    { name_zh: "喀纳斯景区", name_en: "Kanas Lake Scenic Area", province: "新疆维吾尔自治区", city: "阿勒泰地区", province_en: "Xinjiang", city_en: "Altay", sort_order: 2, created_dt: now, record_status: "A" },
    { name_zh: "吐鲁番葡萄沟风景区", name_en: "Turpan Grape Valley Scenic Area", province: "新疆维吾尔自治区", city: "吐鲁番市", province_en: "Xinjiang", city_en: "Turpan", sort_order: 3, created_dt: now, record_status: "A" },
    { name_zh: "喀什噶尔老城旅游景区", name_en: "Kashgar Old City Tourism Area", province: "新疆维吾尔自治区", city: "喀什地区", province_en: "Xinjiang", city_en: "Kashgar", sort_order: 4, created_dt: now, record_status: "A" },
    { name_zh: "独库公路景区", name_en: "Duku Highway Scenic Area", province: "新疆维吾尔自治区", city: "伊犁哈萨克自治州", province_en: "Xinjiang", city_en: "Ili", sort_order: 5, created_dt: now, record_status: "A" },
    { name_zh: "那拉提旅游风景区", name_en: "Nalati Grassland Scenic Area", province: "新疆维吾尔自治区", city: "伊犁哈萨克自治州", province_en: "Xinjiang", city_en: "Ili", sort_order: 6, created_dt: now, record_status: "A" },
    { name_zh: "赛里木湖旅游景区", name_en: "Sayram Lake Scenic Area", province: "新疆维吾尔自治区", city: "博尔塔拉蒙古自治州", province_en: "Xinjiang", city_en: "Bortala", sort_order: 7, created_dt: now, record_status: "A" },
    { name_zh: "帕米尔旅游景区", name_en: "Pamir Tourism Scenic Area", province: "新疆维吾尔自治区", city: "克孜勒苏柯尔克孜自治州", province_en: "Xinjiang", city_en: "Kizilsu", sort_order: 8, created_dt: now, record_status: "A" },
    { name_zh: "库木塔格沙漠风景名胜区", name_en: "Kumtagh Desert Scenic Area", province: "新疆维吾尔自治区", city: "哈密市", province_en: "Xinjiang", city_en: "Hami", sort_order: 9, created_dt: now, record_status: "A" },
    { name_zh: "博斯腾湖景区", name_en: "Bosten Lake Scenic Area", province: "新疆维吾尔自治区", city: "巴音郭楞蒙古自治州", province_en: "Xinjiang", city_en: "Bayingolin", sort_order: 10, created_dt: now, record_status: "A" },
    { name_zh: "伊犁河谷景区", name_en: "Ili River Valley Scenic Area", province: "新疆维吾尔自治区", city: "伊犁哈萨克自治州", province_en: "Xinjiang", city_en: "Ili", sort_order: 11, created_dt: now, record_status: "A" },
    { name_zh: "乌鲁木齐天山大峡谷景区", name_en: "Tianshan Grand Canyon Scenic Area (Urumqi)", province: "新疆维吾尔自治区", city: "乌鲁木齐市", province_en: "Xinjiang", city_en: "Urumqi", sort_order: 12, created_dt: now, record_status: "A" },
    { name_zh: "白哈巴景区", name_en: "Baihaba Scenic Area", province: "新疆维吾尔自治区", city: "阿勒泰地区", province_en: "Xinjiang", city_en: "Altay", sort_order: 13, created_dt: now, record_status: "A" },
    { name_zh: "禾木景区", name_en: "Hemu Village Scenic Area", province: "新疆维吾尔自治区", city: "阿勒泰地区", province_en: "Xinjiang", city_en: "Altay", sort_order: 14, created_dt: now, record_status: "A" },
    { name_zh: "罗布人村寨旅游景区", name_en: "Lop People Village Scenic Area", province: "新疆维吾尔自治区", city: "巴音郭楞蒙古自治州", province_en: "Xinjiang", city_en: "Bayingolin", sort_order: 15, created_dt: now, record_status: "A" },
    { name_zh: "和田玉石文化旅游区", name_en: "Hotan Jade Cultural Tourism Area", province: "新疆维吾尔自治区", city: "和田地区", province_en: "Xinjiang", city_en: "Hotan", sort_order: 16, created_dt: now, record_status: "A" },
    { name_zh: "昭苏天鹅湖旅游景区", name_en: "Zhaosu Swan Lake Scenic Area", province: "新疆维吾尔自治区", city: "伊犁哈萨克自治州", province_en: "Xinjiang", city_en: "Ili", sort_order: 17, created_dt: now, record_status: "A" },
    { name_zh: "巩留库尔德宁景区", name_en: "Gongliu Kurdening Scenic Area", province: "新疆维吾尔自治区", city: "伊犁哈萨克自治州", province_en: "Xinjiang", city_en: "Ili", sort_order: 18, created_dt: now, record_status: "A" },
  ];

  await knex("tb_scenic_spot").insert(spots);
}

export async function down(knex: Knex): Promise<void> {
  await knex("tb_scenic_spot").delete();
}
